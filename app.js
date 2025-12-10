require('dotenv').config();
require('dotenv').config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const path = require("path");
const app = express();

const port = process.env.PORT || 3000;

const port = process.env.PORT || 3000;

// --- 1. SETUP ---
// --- 1. SETUP ---
app.set("view engine", "ejs");
app.use(express.static('public')); 
app.use(express.urlencoded({extended: true})); 

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false
}));

// --- 2. DATABASE CONNECTION ---
const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.RDS_HOSTNAME || process.env.DB_HOST,
        user : process.env.RDS_USERNAME || process.env.DB_USER,
        password : process.env.RDS_PASSWORD || process.env.DB_PASSWORD,
        database : process.env.RDS_DB_NAME || process.env.DB_NAME,
        port : process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

// Middleware
function checkAuth(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/login');
}

// --- 3. ROUTES ---

// ROOT ROUTE (Pricing Page)
app.get("/", (req, res) => {
    // TRYING LOWERCASE TABLE & COLUMNS
    let query = knex.select(
        'productname as type',    // Changed ProductName -> productname
        'material as description', // Changed Material -> material
        'price as price'           // Changed Price -> price
    ).from("product");             // Changed Product -> product

    if (req.query.search) {
        query = query.where("productname", "ilike", `%${req.query.search}%`);
    }

    query.then(pallets => {
        // FIXED: Changed 'pallets' to 'Products' to match index.ejs variable
        res.render("index", { Products: pallets, user: req.session.user });
    }).catch(err => {
        console.log("THE REAL ERROR IS HERE:", err);
        res.status(500).send("Error retrieving products. Check Terminal for details.");
    });
});

// CONTACT FORM (Create Order)
// CONTACT FORM (Create Order)
app.post("/contact", (req, res) => {
    knex("order").insert({
        UserName: req.body.customerName, // Matches form input 'customerName'
        ProductName: req.body.requestType, // Matches form input 'requestType'
        QuotedPrice: 0.00,
        Quantity: req.body.quantity      // Matches form input 'quantity'
    }).then(() => {
        res.redirect("/");
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error submitting request.");
    });
});

// LOGIN (Simple Admin)
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", (req, res) => {
    if (req.body.username === "admin" && req.body.password === "password123") {
        req.session.user = "admin";
        req.session.user = "admin";
        res.redirect("/orders");
    } else {
        res.redirect("/login");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// ADMIN DASHBOARD (Read Orders)
app.get("/orders", checkAuth, (req, res) => {
    // ERD MAPPING: 'order' Table
    knex.select('OrderNumber as id', 'UserName as customer_name', 'ShipDate')
        .from("order") // FIXED: Lowercase 'order'
        .orderBy("OrderNumber")
        .then(rows => {
            // Transform Data for View: If ShipDate is null, Status = Pending
            const orders = rows.map(o => ({
                id: o.id,
                customer_name: o.customer_name,
                status: o.ShipDate ? "Completed" : "Pending"
            }));
            
            res.render("orders", { orders: orders });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading orders.");
        });
});

// EDIT ORDER (Show Form)
app.get("/editOrder/:id", checkAuth, (req, res) => {
    // FIXED: Added ProductName, QuotedPrice, Quantity to selection
    knex.select('OrderNumber as id', 'UserName as customer_name', 'ShipDate', 'ProductName', 'QuotedPrice', 'Quantity')
        .from("order") // FIXED: Lowercase 'order'
        .where("OrderNumber", req.params.id)
        .first()
        .then(row => {
            // Transform for the View
            const order = {
                id: row.id,
                customer_name: row.customer_name,
                ProductName: row.ProductName, // Added
                QuotedPrice: row.QuotedPrice, // Added
                Quantity: row.Quantity,       // Added
                status: row.ShipDate ? "Completed" : "Pending"
            };
            res.render("editOrder", { order: order });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading order for edit.");
        });
});

// EDIT ORDER (Update DB)
app.post("/editOrder/:id", checkAuth, (req, res) => {
    // LOGIC: If user chose "Completed", set ShipDate to today. If "Pending", set NULL.
    const newShipDate = req.body.status === "Completed" ? new Date() : null;

    knex("order") // FIXED: Lowercase 'order'
        .where("OrderNumber", req.params.id)
        .update({
            UserName: req.body.customerName,
            ProductName: req.body.productName, // FIXED: Now updates Product
            QuotedPrice: req.body.quotedPrice, // FIXED: Now updates Price
            Quantity: req.body.quantity,       // FIXED: Now updates Quantity
            ShipDate: newShipDate
        }).then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error updating order.");
        });
});

// DELETE ORDER
app.post("/deleteOrder/:id", checkAuth, (req, res) => {
    knex("order").where("OrderNumber", req.params.id).del() // FIXED: Lowercase 'order'
        .then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error deleting order.");
        });
});

app.listen(port, () => console.log(`Production Server running on port ${port}`));