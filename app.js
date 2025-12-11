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

// Middleware to check if user is logged in (AUTHENTICATION)
function checkAuth(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/login');
}

// NEW Middleware to check if user is a Manager (AUTHORIZATION: Level 'M')
function checkManagerAuth(req, res, next) {
    // Check if the user is authenticated AND their level is 'M'
    if (req.session.user && req.session.user.Level === 'M') {
        next();
    } else {
        // Redirect or send an error if not authorized
        res.status(403).send("Error 403: Forbidden. You do not have manager access to this page.");
    }
}

// ==========================================
// 3. ROUTES
// ==========================================

// --- HOME PAGE (Pricing and Product Listing) ---
app.get("/", (req, res) => {
    let query = knex.select('*').from("product"); 
    let searchTerm = req.query.search || '';

    if (searchTerm) {
        // Search by Product Name using case-insensitive 'ilike'
        query = query.where("ProductName", "ilike", `%${searchTerm}%`);
    }

    query.then(pallets => {
        res.render("index", { 
            products: pallets, 
            user: req.session.user,
            searchTerm: searchTerm
        });
    }).catch(err => {
        console.log(err);
        res.status(500).send("Error retrieving products.");
    });
});

// --- CONTACT FORM ---
app.post("/contact", (req, res) => {
    // Note: This route uses 'order' table. If this table should map to 'orders' 
    // and 'order_detail' in the ERD, this logic might need refinement later.
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

// ----------------------------------------
// --- LOGIN ROUTES (Updated for DB Check) ---
// ----------------------------------------
app.get("/login", (req, res) => { 
    if (req.session.user) {
        return res.redirect("/orders");
    }
    res.render("login"); 
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    // Query the database for the user by UserName
    knex("users")
        .where({ UserName: username })
        .first()
        .then(user => {
            // Check if user exists AND password matches
            if (user && user.Password === password) {
                // IMPORTANT: Save the entire user object (including Level) to session
                req.session.user = user; 
                res.redirect("/orders");
            } else {
                console.log("Login failed: Invalid credentials");
                // Optional: Pass an error message to the login page
                res.redirect("/login"); 
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("An error occurred during login.");
        });
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Error destroying session:", err);
        res.redirect("/");
    });
});

// ----------------------------------------
// --- PRODUCT MANAGEMENT (Manager Only) ---
// ----------------------------------------

// --- ADD PRODUCT (GET) ---
app.get("/addProduct", checkManagerAuth, (req, res) => {
    res.render("addProduct", { user: req.session.user });
});

// --- ADD PRODUCT (POST) ---
app.post("/addProduct", checkManagerAuth, (req, res) => {
    const { productName, price, heatTreat, way } = req.body;
    
    knex('product').insert({
        ProductName: productName,
        Price: price,
        HeatTreat: heatTreat,
        Way: way
    })
    .then(() => {
        res.redirect('/');
    })
    .catch(err => {
        console.error(err);
        res.status(500).send("Error adding product.");
    });
});

// --- EDIT PRODUCT (GET) ---
app.get("/editProduct/:id", checkManagerAuth, (req, res) => {
    knex('product')
        .where('ProductID', req.params.id)
        .first()
        .then(product => {
            if (!product) return res.status(404).send("Product not found.");
            res.render('editProduct', { product: product, user: req.session.user });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error loading product for edit.");
        });
});

// --- EDIT PRODUCT (POST) ---
app.post("/editProduct/:id", checkManagerAuth, (req, res) => {
    const { productName, price, heatTreat, way } = req.body;
    
    knex('product')
        .where('ProductID', req.params.id)
        .update({
            ProductName: productName,
            Price: price,
            HeatTreat: heatTreat,
            Way: way
        })
        .then(() => {
            res.redirect('/');
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error updating product.");
        });
});

// --- DELETE PRODUCT (POST) ---
app.post("/deleteProduct/:id", checkManagerAuth, (req, res) => {
    knex('product')
        .where('ProductID', req.params.id)
        .del()
        .then(() => {
            res.redirect('/');
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error deleting product.");
        });
});

// ----------------------------------------
// --- DASHBOARD AND ORDER MANAGEMENT ---
// ----------------------------------------

// --- DASHBOARD ---
app.get("/orders", checkAuth, (req, res) => {
    knex('orders')
        .select('OrderNumber', 'UserName', 'ShipDate')
        .orderBy("OrderNumber", "asc")
        .then(rows => {
            // 1. Process the raw database rows
            const orders = rows.map(o => ({
                id: o.OrderNumber,
                customer_name: o.UserName,
                status: o.ShipDate ? "Completed" : "Pending"
            }));

            // 2. Calculate the statistics
            const totalOrders = orders.length;
            // FIXED: changed .filterWH to .filter
            const completedCount = orders.filter(o => o.status === "Completed").length;
            const activeCount = totalOrders - completedCount;

            // 3. Render the page with the 'stats' object included
            res.render("orders", { 
                orders: orders, 
                user: req.session.user,
                stats: {
                    total: totalOrders,
                    active: activeCount,
                    completed: completedCount
                }
            });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading orders.");
        });
});

// --- EDIT ORDER (GET) ---
app.get("/editOrder/:id", checkAuth, (req, res) => {
    knex('orders')
        .join('order_detail', 'orders.OrderNumber', '=', 'order_detail.OrderNumber')
        .select(
            'orders.OrderNumber',
            'orders.UserName',
            'orders.ShipDate',
            'order_detail.ProductName', // This column is in order_detail
            'order_detail.QuotedPrice', // This column is in order_detail
            'order_detail.Quantity'     // This column is in order_detail
        )
        .where('orders.OrderNumber', req.params.id)
        .first()
        .then(row => {
            if (!row) return res.status(404).send("Order not found");
            
            const order = {
                id: row.OrderNumber,
                customer_name: row.UserName,
                ProductName: row.ProductName,
                QuotedPrice: row.QuotedPrice,
                Quantity: row.Quantity,
                status: row.ShipDate ? "Completed" : "Pending"
            };
            res.render("editOrder", { order: order, user: req.session.user });
        }).catch(err => {
            console.log(err);
            res.status(500).send("Error loading order.");
        });
});

// --- EDIT ORDER (POST) ---
app.post("/editOrder/:id", checkAuth, async (req, res) => {
    const newShipDate = req.body.status === "Completed" ? new Date() : null;
    const orderId = req.params.id;

    try {
        // 1. Update the 'orders' table (Customer & Status)
        await knex('orders')
            .where('OrderNumber', orderId)
            .update({
                UserName: req.body.customerName,
                ShipDate: newShipDate
            });

        // 2. Update the 'order_detail' table (Product details)
        await knex('order_detail')
            .where('OrderNumber', orderId)
            .update({
                ProductName: req.body.productName,
                QuotedPrice: req.body.quotedPrice,
                Quantity: req.body.quantity
            });

        res.redirect("/orders");

    } catch (err) {
        console.log(err);
        res.status(500).send("Error updating order.");
    }
});

// --- DELETE ORDER ---
app.post("/deleteOrder/:id", checkAuth, async (req, res) => {
    try {
        // Delete details first (optional if your DB has ON DELETE CASCADE)
        await knex('order_detail').where('OrderNumber', req.params.id).del();
        
        // Delete the main order
        await knex('orders').where('OrderNumber', req.params.id).del();
        
        res.redirect("/orders");
    } catch (err) {
        console.log(err);
        res.status(500).send("Error deleting order.");
    }
});

// --- About route --
app.get("/about", (req, res) => {
    res.render("about", { user: req.session.user });
});

app.listen(port, () => console.log(`Server running on port ${port}`));