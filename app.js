// ==========================================
// 1. SETUP & DEPENDENCIES
// ==========================================
require('dotenv').config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.static('public')); 
app.use(express.urlencoded({extended: true})); 

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false
}));

// ==========================================
// 2. DATABASE CONNECTION
// ==========================================
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

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/login');
}

// ==========================================
// 3. ROUTES
// ==========================================

// --- HOME PAGE (Pricing) ---
app.get("/", (req, res) => {
    // CLEANER: Just select everything. 
    // We assume the DB columns are: productname, material, price (lowercase)
    let query = knex.select('*').from("product"); 

    if (req.query.search) {
        query = query.where("productname", "ilike", `%${req.query.search}%`);
    }

    query.then(pallets => {
        // Send the raw database results to the page
        res.render("index", { 
            products: pallets,      // Changed to lowercase 'products'
            user: req.session.user 
        });
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error retrieving products.");
    });
});

// --- CONTACT FORM ---
app.post("/contact", (req, res) => {
    // Insert using standard DB column names
    knex("order").insert({
        username: req.body.customerName,   
        productname: req.body.requestType, 
        quotedprice: 0.00,                 
        quantity: req.body.quantity 
    }).then(() => {
        res.redirect("/");
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error submitting request.");
    });
});

// --- LOGIN ---
app.get("/login", (req, res) => { res.render("login"); });

app.post("/login", (req, res) => {
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

// --- DASHBOARD ---
app.get("/orders", checkAuth, (req, res) => {
    knex.select('*').from("order").orderBy("ordernumber")
        .then(rows => {
            const orders = rows.map(o => ({
                id: o.ordernumber,       // Map database 'ordernumber' to 'id'
                customer_name: o.username, // Map database 'username' to 'customer_name'
                status: o.shipdate ? "Completed" : "Pending"
            }));
            res.render("orders", { orders: orders });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading orders.");
        });
});

// --- EDIT ORDER (GET) ---
app.get("/editOrder/:id", checkAuth, (req, res) => {
    knex.select('*').from("order").where("ordernumber", req.params.id).first()
        .then(row => {
            const order = {
                id: row.ordernumber,
                customer_name: row.username,
                productname: row.productname, // lowercase from DB
                quotedprice: row.quotedprice, // lowercase from DB
                quantity: row.quantity,       // lowercase from DB
                status: row.shipdate ? "Completed" : "Pending"
            };
            res.render("editOrder", { order: order });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading order.");
        });
});

// --- EDIT ORDER (POST) ---
app.post("/editOrder/:id", checkAuth, (req, res) => {
    const newShipDate = req.body.status === "Completed" ? new Date() : null;
    
    knex("order").where("ordernumber", req.params.id)
        .update({
            username: req.body.customerName,
            productname: req.body.productName,
            quotedprice: req.body.quotedPrice,
            quantity: req.body.quantity,
            shipdate: newShipDate
        }).then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error updating order.");
        });
});

// --- DELETE ORDER ---
app.post("/deleteOrder/:id", checkAuth, (req, res) => {
    knex("order").where("ordernumber", req.params.id).del()
        .then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error deleting order.");
        });
});

app.listen(port, () => console.log(`Server running on port ${port}`));