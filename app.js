// --- UI TEST MODE app.js (No Database Required) ---
const express = require("express");
const session = require("express-session");
const app = express();
const port = 3000;

// Setup
app.set("view engine", "ejs");
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));

// --- MOCK DATA (This replaces your Database for now) ---
const mockPallets = [
    { type: "48x40 GMA", description: "Standard Grade A", price: 12.50 },
    { type: "48x40 Grade B", description: "Recycled / Repaired", price: 8.75 },
    { type: "Euro Pallet", description: "1200x800mm Heat Treated", price: 15.00 }
];

const mockOrders = [
    { id: 101, customer_name: "John Doe Construction", request_type: "Quote", quantity: 50, status: "Pending" },
    { id: 102, customer_name: "Smith Logistics", request_type: "Pickup", quantity: 200, status: "Completed" }
];

// --- ROUTES ---

// 1. HOME PAGE (Pricing + Contact)
app.get("/", (req, res) => {
    // UPDATED: Now passing 'user' so the Navbar knows if you are logged in
    res.render("index", { 
        pallets: mockPallets,
        user: req.session.user 
    });
});

// 2. CONTACT FORM SUBMIT (Fake)
app.post("/contact", (req, res) => {
    console.log("Form Submitted:", req.body); 
    res.redirect("/");
});

// 3. LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", (req, res) => {
    // Simple login check
    if (req.body.username === "admin" && req.body.password === "password123") {
        req.session.user = "admin"; // This saves the login
        res.redirect("/orders");
    } else {
        res.redirect("/login");
    }
});

// 4. ADMIN DASHBOARD (Orders)
app.get("/orders", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    
    // We pass mockOrders here
    res.render("orders", { orders: mockOrders });
});

// 5. EDIT PAGE
app.get("/editOrder/:id", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    // Find the fake order that matches the ID in the URL
    const order = mockOrders.find(o => o.id == req.params.id);
    
    if (order) {
        res.render("editOrder", { order: order });
    } else {
        res.send("Order not found (This is just a test mode!)");
    }
});

app.post("/editOrder/:id", (req, res) => {
    console.log(`Updated Order ${req.params.id}:`, req.body);
    // In a real app, we would update the DB here. 
    // For test mode, we just redirect back to show it "worked".
    res.redirect("/orders");
});

// 6. DELETE (Fake)
app.post("/deleteOrder/:id", (req, res) => {
    console.log(`Deleted Order ${req.params.id}`);
    res.redirect("/orders");
});

// 7. LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

app.listen(port, () => console.log(`Test Server running on http://localhost:${port}`));