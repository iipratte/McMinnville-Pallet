require('dotenv').config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const app = express();

const port = process.env.PORT || 3000;

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

function checkAuth(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/login');
}

// --- 3. ROUTES ---

// ROOT ROUTE (Pricing Page)
app.get("/", (req, res) => {
    // FIXED: Renamed aliases to match index.ejs (ProductName, Material, Price)
    let query = knex.select(
        'productname as ProductName', 
        'material as Material', 
        'price as Price'
    ).from("product"); 

    if (req.query.search) {
        query = query.where("productname", "ilike", `%${req.query.search}%`);
    }

    query.then(pallets => {
        // Sends 'Products' (Capital P) to match the View
        res.render("index", { Products: pallets, user: req.session.user });
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error retrieving products.");
    });
});

// CONTACT FORM
app.post("/contact", (req, res) => {
    knex("order").insert({
        UserName: req.body.customerName,
        // Note: These columns must exist in your 'order' table!
        ProductName: req.body.requestType, 
        QuotedPrice: 0.00,
        Quantity: req.body.quantity 
    }).then(() => {
        res.redirect("/");
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error submitting request. Check if columns exist in DB.");
    });
});

// LOGIN
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

// DASHBOARD
app.get("/orders", checkAuth, (req, res) => {
    knex.select('OrderNumber as id', 'UserName as customer_name', 'ShipDate')
        .from("order")
        .orderBy("OrderNumber")
        .then(rows => {
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

// EDIT ORDER (Get)
app.get("/editOrder/:id", checkAuth, (req, res) => {
    // Note: This tries to grab Product/Price/Quantity from 'order' table.
    knex.select('*')
        .from("order")
        .where("OrderNumber", req.params.id)
        .first()
        .then(row => {
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

// EDIT ORDER (Post)
app.post("/editOrder/:id", checkAuth, (req, res) => {
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
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error updating order.");
        });
});

// DELETE
app.post("/deleteOrder/:id", checkAuth, (req, res) => {
    knex("order").where("OrderNumber", req.params.id).del()
        .then(() => {
            res.redirect("/orders");
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error deleting order.");
        });
});

app.listen(port, () => console.log(`Server running on port ${port}`));