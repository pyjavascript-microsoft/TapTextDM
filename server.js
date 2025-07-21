const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bcrypt = require("bcrypt");
const Datastore = require("nedb");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// DB Setup
const usersDB = new Datastore({ filename: "db/users.db", autoload: true });
const messagesDB = new Datastore({ filename: "db/messages.db", autoload: true });
const warningsDB = new Datastore({ filename: "db/warnings.db", autoload: true });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Admin preset
const ADMIN_USERNAME = "AHDX";
const ADMIN_PASSWORD = "admin123"; // bcrypt will hash this

// Ensure admin exists
bcrypt.hash(ADMIN_PASSWORD, 10, (err, hash) => {
  usersDB.findOne({ username: ADMIN_USERNAME }, (err, user) => {
    if (!user) {
      usersDB.insert({
        username: ADMIN_USERNAME,
        password: hash,
        displayName: "AHDX (Admin)",
        role: "admin",
        followers: [],
        following: []
      });
    }
  });
});

// Auth and profile endpoints
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  usersDB.findOne({ username }, (err, user) => {
    if (!user) return res.status(401).send("User not found");
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        res.json(user);
      } else {
        res.status(401).send("Wrong password");
      }
    });
  });
});

app.post("/register", (req, res) => {
  const { username, password, displayName } = req.body;
  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser) return res.status(400).send("Username taken");
    bcrypt.hash(password, 10, (err, hash) => {
      usersDB.insert({
        username,
        password: hash,
        displayName,
        role: "user",
        followers: [],
        following: []
      }, (err, newUser) => res.json(newUser));
    });
  });
});

app.post("/update-profile", (req, res) => {
  const { username, displayName } = req.body;
  usersDB.update({ username }, { $set: { displayName } }, {}, err => {
    if (err) return res.status(500).send("Update failed");
    res.send("Updated");
  });
});

// Admin powers
app.post("/warn", (req, res) => {
  const { admin, target, reason } = req.body;
  usersDB.findOne({ username: admin }, (err, adminUser) => {
    if (adminUser?.role === "admin") {
      warningsDB.insert({ target, reason, by: admin });
      res.send("Warned");
    } else {
      res.status(403).send("Not authorized");
    }
  });
});

app.get("/warnings/:user", (req, res) => {
  warningsDB.find({ target: req.params.user }, (err, data) => res.json(data));
});

app.post("/promote", (req, res) => {
  const { admin, target } = req.body;
  usersDB.findOne({ username: admin }, (err, user) => {
    if (user?.role === "admin") {
      usersDB.update({ username: target }, { $set: { role: "admin" } }, {}, () => res.send("Promoted"));
    } else {
      res.status(403).send("Unauthorized");
    }
  });
});

app.post("/demote", (req, res) => {
  const { admin, target } = req.body;
  usersDB.findOne({ username: admin }, (err, user) => {
    if (user?.role === "admin") {
      usersDB.update({ username: target }, { $set: { role: "user" } }, {}, () => res.send("Demoted"));
    } else {
      res.status(403).send("Unauthorized");
    }
  });
});

// Follow system
app.post("/follow", (req, res) => {
  const { follower, followee } = req.body;
  usersDB.update({ username: follower }, { $addToSet: { following: followee } }, {}, () => {});
  usersDB.update({ username: followee }, { $addToSet: { followers: follower } }, {}, () => {
    res.send("Followed");
  });
});

// Socket.IO DMs
io.on("connection", socket => {
  socket.on("dm", ({ from, to, message }) => {
    messagesDB.insert({ from, to, message, timestamp: new Date() });
    io.emit("dm", { from, to, message, timestamp: new Date() });
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`TapText running on port ${PORT}`);
});