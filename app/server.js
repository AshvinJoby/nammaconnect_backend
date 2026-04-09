const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

let vendors = [
  {
    id: 1,
    name: "Dosa Stall",
    menu: [
      { item: "Masala Dosa", price: 50 },
      { item: "Idli", price: 30 }
    ]
  },
  {
    id: 2,
    name: "Chaat Corner",
    menu: [
      { item: "Pani Puri", price: 30 },
      { item: "Bhel Puri", price: 40 }
    ]
  }
];

let orders = [];

app.get("/vendors", (req, res) => {
  res.json(vendors);
});

app.get("/vendor/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const vendor = vendors.find(v => v.id === id);

  if (!vendor) {
    return res.status(404).json({ message: "Vendor not found" });
  }

  res.json(vendor);
});


app.post("/order", (req, res) => {
  const newOrder = {
    id: orders.length + 1,
    ...req.body,
    status: "pending"
  };

  orders.push(newOrder);
  res.json({ message: "Order placed", order: newOrder });
});


app.get("/orders", (req, res) => {
  res.json(orders);
});

app.put("/order/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const order = orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  order.status = req.body.status;
  res.json({ message: "Order updated", order });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});