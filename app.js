// 1. SETUP & DEPENDENCIES
// Load environment variables from .env file (for database security)
require('dotenv').config();

// Import required modules
const express = require("express");
const session = require("express-session"); // Handles user login sessions
const path = require("path");
const app = express();

// Set the port (uses AWS/Heroku port or defaults to 3000 for localhost)
const port = process.env.PORT || 3000;

// Configure the view engine to use EJS templates
app.set("view engine", "ejs");

// Serve static files (CSS, Images) from the 'public' folder
app.use(express.static('public')); 

// Middleware to parse form data (so we can read req.body)
app.use(express.urlencoded({extended: true})); 

// Configure Session Settings (Used to keep the admin logged in)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key', // Used to sign the session ID cookie
    resave: false,
    saveUninitialized: false
}));

// 2. DATABASE CONNECTION (Knex.js)
// Connects to the AWS RDS PostgreSQL database using environment variables
const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.RDS_HOSTNAME || process.env.DB_HOST,
        user : process.env.RDS_USERNAME || process.env.DB_USER,
        password : process.env.RDS_PASSWORD || process.env.DB_PASSWORD,
        database : process.env.RDS_DB_NAME || process.env.DB_NAME,
        port : process.env.RDS_PORT || 5432,
        // AWS RDS often requires SSL for secure connections
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

// 3. MIDDLEWARE (Security)
// This function checks if a user is logged in before letting them see the page.
// If they are not logged in, it forces them to the Login page.
function checkAuth(req, res, next) {
    if (req.session.user) {
        next(); // User is logged in, proceed to the requested page
    } else {
        res.redirect('/login'); // User is NOT logged in, redirect to login
    }
}

// 4. ROUTES

// --- PUBLIC ROUTES (No Login Required) ---

// HOME PAGE: Displays current inventory pricing and contact form
app.get("/", (req, res) => {
    // Select specific columns and rename them to match the View's variable names
    let query = knex.select(
        'productname as ProductName', 
        'material as Material', 
        'price as Price'
    ).from("product"); 

    // Search Feature: If user typed in the search bar, filter the results
    if (req.query.search) {
        query = query.where("productname", "ilike", `%${req.query.search}%`);
    }

    // Execute query and render the index page
    query.then(pallets => {
        res.render("index", { 
            Products: pallets,      // Send the data to the view
            user: req.session.user  // Send login status (for the navbar)
        });
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error retrieving products.");
    });
});

// CONTACT FORM: Handles form submission from the home page
app.post("/contact", (req, res) => {
    // Insert the new order request into the database
    knex("order").insert({
        UserName: req.body.customerName,   // Maps form field to DB column
        ProductName: req.body.requestType, // Maps form field to DB column
        QuotedPrice: 0.00,                 // Default price for quotes
        Quantity: req.body.quantity 
    }).then(() => {
        res.redirect("/"); // On success, go back home
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error submitting request.");
    });
});

// LOGIN PAGE: Shows the login form
app.get("/login", (req, res) => { 
    res.render("login"); 
});

// LOGIN LOGIC: Checks username/password
app.post("/login", (req, res) => {
    // Hardcoded credentials for simplicity (as per project requirements)
    if (req.body.username === "admin" && req.body.password === "password123") {
        req.session.user = "admin"; // Create a session
        res.redirect("/orders");    // Send to dashboard
    } else {
        res.redirect("/login");     // Invalid login, try again
    }
});

// LOGOUT LOGIC: Destroys the session
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// --- PROTECTED ADMIN ROUTES (Require 'checkAuth') ---

// ADMIN DASHBOARD: View all orders
app.get("/orders", checkAuth, (req, res) => {
    // Fetch all orders and sort by ID
    knex.select('OrderNumber as id', 'UserName as customer_name', 'ShipDate')
        .from("order")
        .orderBy("OrderNumber")
        .then(rows => {
            // Process data: Determine status based on ShipDate
            const orders = rows.map(o => ({
                id: o.id,
                customer_name: o.customer_name,
                status: o.ShipDate ? "Completed" : "Pending" // If ShipDate exists, it's completed
            }));
            res.render("orders", { orders: orders });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading orders.");
        });
});

// EDIT ORDER PAGE: Shows the form to edit an existing order
app.get("/editOrder/:id", checkAuth, (req, res) => {
    // Select specific order by ID
    knex.select('*')
        .from("order")
        .where("OrderNumber", req.params.id)
        .first() // We expect only one result
        .then(row => {
            // Prepare the data object for the view
            const order = {
                id: row.OrderNumber,
                customer_name: row.UserName,
                ProductName: row.ProductName,
                QuotedPrice: row.QuotedPrice, 
                Quantity: row.Quantity, 
                status: row.ShipDate ? "Completed" : "Pending"
            };
            res.render("editOrder", { order: order });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading order.");
        });
});

// UPDATE ORDER: Handles the actual database update
app.post("/editOrder/:id", checkAuth, (req, res) => {
    // If status is 'Completed', set today's date. Otherwise null.
    const newShipDate = req.body.status === "Completed" ? new Date() : null;
    
    knex("order")
        .where("OrderNumber", req.params.id)
        .update({
            UserName: req.body.customerName,
            ProductName: req.body.productName,
            QuotedPrice: req.body.quotedPrice,
            Quantity: req.body.quantity,
            ShipDate: newShipDate
        }).then(() => {
            res.redirect("/orders"); // Go back to dashboard
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error updating order.");
        });
});

// DELETE ORDER: Removes an order from the database
app.post("/deleteOrder/:id", checkAuth, (req, res) => {
    knex("order")
        .where("OrderNumber", req.params.id)
        .del() // Performs the delete operation
        .then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error deleting order.");
        });
});

// 5. START SERVER
app.listen(port, () => console.log(`Server running on port ${port}`));