require('dotenv').config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const app = express();

const port = process.env.PORT || 3000;

// --- 1. SETUP ---
app.set("view engine", "ejs");
app.use(express.static('public')); // Serves your new styles.css and images
app.use(express.urlencoded({extended: true})); // Reads form data

// Session Setup (for Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false
}));

// --- 2. DATABASE CONNECTION (The Real Deal) ---
const knex = require("knex")({
    client: "pg",
    connection: {
        // These process.env variables must be set in AWS Elastic Beanstalk Configuration
        host : process.env.RDS_HOSTNAME || process.env.DB_HOST,
        user : process.env.RDS_USERNAME || process.env.DB_USER,
        password : process.env.RDS_PASSWORD || process.env.DB_PASSWORD,
        database : process.env.RDS_DB_NAME || process.env.DB_NAME,
        port : process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

// Middleware to protect Admin Routes
function checkAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// --- 3. ROUTES ---

// ROOT ROUTE (Home + Pricing + Search)
app.get("/", (req, res) => {
    // Start the query to get all pallets
    let query = knex.select().from("product"); 

    // REAL SEARCH LOGIC (SQL)
    if (req.query.search) {
        query = query.where("ProductName", "ilike", `%${req.query.search}%`)
                     .orWhere("Material", "ilike", `%${req.query.search}%`);
    }

    query.then(product => {
        // Render index and pass BOTH the data and the user (for the navbar)
        res.render("index", { 
            product: product, 
            user: req.session.user 
        });
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error retrieving products from database.");
    });
});

// CONTACT FORM (Create Order)
app.post("/contact", (req, res) => {
    knex("order").insert({
        OrderNumber: req.body.OrderNumber,
        ProductName: req.body.ProductName,
        QuotedPrice: req.body.QuotedPrice,
        Quantity: req.body.Quantity
    }).then(() => {
        res.redirect("/");
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error submitting request.");
    });
});

// LOGIN ROUTES
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", (req, res) => {
    // Hardcoded Admin Credentials (Keep it simple as requested)
    if (req.body.username === "admin" && req.body.password === "password123") {
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
    knex.select().from("order").orderBy("OrderNumber")
        .then(orders => {
            res.render("order", { orders: orders });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading orders.");
        });
});

// EDIT ORDER (Read One for Editing)
app.get("/editOrder/:id", checkAuth, (req, res) => {
    knex.select().from("order").where("id", req.params.id).first()
        .then(order => {
            res.render("editOrder", { order: order });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading order.");
        });
});

// UPDATE ORDER (Update in DB)
app.post("/editOrder/:id", checkAuth, (req, res) => {
    knex("order").where("id", req.params.id).update({
        ProductName: req.body.ProductName,
        QuotedPrice: req.body.QuotedPrice,
        Quantity: req.body.Quantity
    }).then(() => {
        res.redirect("/orders");
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error updating order.");
    });
});

// DELETE ORDER (Delete from DB)
app.post("/deleteOrder/:id", checkAuth, (req, res) => {
    knex("order").where("id", req.params.id).del()
        .then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error deleting order.");
        });
});

// Start Server
app.listen(port, () => console.log(`Production Server running on port ${port}`));