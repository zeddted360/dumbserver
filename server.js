import express from "express";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { userModel, conversationModel, messageModel } from "./schema.js";
import cors from "cors";
import morgan from "morgan";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();

// Initialize Socket.IO
const io = new Server({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGOURI)
  .then(() => console.log(`connected to the database`))
  .catch((err) => console.error(err.message));

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(morgan("dev"));

// Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Routes
app.get("/alert", async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: `"Site Notifier" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: "New Visitor Alert",
      text: `Hello! Someone just visited your site at ${new Date().toLocaleString()}.`,
    });
    console.log("Email sent: %s", info.messageId);
    res.status(200).send("Welcome to the homepage!");
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send("An error occurred.");
  }
});

// User routes
app.post("/api/user", async (req, res) => {
  const { username } = req.body;
  try {
    const existUser = await userModel.findOne({ username });
    if (existUser) {
      return res.status(409).json({ message: "ID already in use" });
    }
    const newUser = await userModel.create({ username });
    res.status(201).json({ message: newUser });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await userModel.find({});
    res.status(200).json({ message: users });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/conversations/:username", async (req, res) => {
  const { username } = req.params;
  const [User1, User2] = username.split("_");
  try {
    const conversations = await conversationModel.find({
      participants: { $all: [User1, User2] },
    });
    if (conversations.length > 0) {
      res.status(200).json({ message: conversations });
    } else {
      const newConversation = await conversationModel.create({
        participants: [User1, User2],
      });
      res.status(201).json({ message: newConversation });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/messages/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  try {
    const messages = await messageModel.find({ conversationId });
    if (messages.length > 0) {
      res.status(200).json({ message: messages });
    } else {
      res.status(404).json({ message: "No open conversation yet" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("updateUser", async ({ socketId, username }) => {
    try {
      if (socketId && username) {
        const updatedUser = await userModel.findOneAndUpdate(
          { username },
          {
            socketId,
            onlineStatus: true,
            isAdmin: username === process.env.ADMIN_USERNAME,
          },
          { new: true }
        );
        console.log("User updated:", updatedUser);
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  });

  socket.on(
    "chat-message",
    async ({ sender, receiver, content, conversationId }) => {
      try {
        const newMessage = new messageModel({
          content,
          sender,
          receiver,
          conversationId,
          timestamp: new Date(),
        });

        await newMessage.save();

        const receiverSocket = await userModel.findOne({ username: receiver });
        if (receiverSocket?.socketId) {
          io.to(receiverSocket.socketId).emit("chat-message", newMessage);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        socket.emit("error", { message: "Failed to process message" });
      }
    }
  );

  socket.on("typing", ({ typingUser }) => {
    socket.broadcast.emit("typing", typingUser);
  });

  socket.on("disconnect", async () => {
    try {
      await userModel.findOneAndUpdate(
        { socketId: socket.id },
        { onlineStatus: false },
        { new: true }
      );
      console.log("Client disconnected:", socket.id);
    } catch (error) {
      console.error("Error updating user status on disconnect:", error);
    }
  });
});

// Create API endpoint for Socket.IO
app.post("/api/socket", (req, res) => {
  try {
    if (io) {
      io.emit(req.body.event, req.body.data);
      res.status(200).json({ message: "Event emitted successfully" });
    } else {
      res.status(500).json({ message: "Socket.IO not initialized" });
    }
  } catch (error) {
    console.error("Error emitting socket event:", error);
    res.status(500).json({ message: "Failed to emit event" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

export default app;
