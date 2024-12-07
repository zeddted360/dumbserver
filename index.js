import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { userModel, conversationModel, messageModel } from "./schema.js";
import cors from "cors";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
import multer from "multer";
import path from "node:path";
import nodemailer from "nodemailer";
import dotenv from 'dotenv'
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const uri =  process.env.MONGOURI 
const port = process.env.PORT;
const adminUsername = process.env.ADMIN;

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use(cors({}));
app.use(morgan("dev"));

mongoose
  .connect(uri)
  .then(() => console.log(`connected to the database`))
  .catch((err) => console.error(err.message));

const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    const uniqueName = `${randomUUID()}_${Date.now()}${path.extname(
      file.originalname
    )}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


app.get('/', (req, res) => {
  res.status(200).json({message:'server running'});
})

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

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

// add new user
app.post("/api/user", async (req, res) => {
  const { username } = req.body;
  try {
    const existUser = await userModel.findOne({ username });
    if (existUser) {
      res.status(409).json({ message: "ID already in use" });
      return;
    }
    const newUser = await userModel.create({ username });
    res.status(201).json({ message: newUser });
  } catch (error) {
    res.status(500).json({ mesaage: "Internal server error" });
    console.log(error.message);
  }
});
// get all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await userModel.find({});
    res.status(200).json({ message: users });
  } catch (error) {
    res.status(500).json({ mesaage: "Internal server error" });
    console.error(error.message);
  }
});

// get a conversation if non create it
app.get("/api/conversations/:username", async (req, res) => {
  const { username } = req.params;
  const User1 = username.split("_")[0];
  const User2 = username.split("_")[1];
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

// get messages from a conversation
app.get("/api/messages/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  try {
    const result = await messageModel.find({ conversationId });
    if (result && result.length > 0) {
      res.status(200).json({ message: result });
    } else {
      res.status(404).json({ message: "No open conversation yet" });
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: "Error: Internal server error" });
  }
});

io.on("connection", (socket) => {
  socket.on("updateUser", async ({ socketId, username }) => {
    if (socketId && username) {
      const updatedUser = await userModel.findOneAndUpdate(
        { username },
        {
          socketId,
          onlineStatus: true,
          isAdmin: username === "xxxDark" ? true : false,
        },
        { new: true }
      );
      console.log('the current updated user is :',updatedUser)
    }
  });

  socket.on(
    "chat-message",
    async ({ sender, receiver, content, conversationId, fileUrl }) => {
      try {
        const newMessage = new messageModel({
          content,
          sender,
          receiver,
          conversationId,
          timestamp: new Date(),
          fileUrl,
        });

        await newMessage.save();

        const receiverSocket = await userModel.findOne({ username: receiver });
        if (receiverSocket) {
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
    await userModel.findOneAndUpdate(
      { socketId: socket.id },
      { onlineStatus: false },
      { new: true }
    );
  });
});

server
  .listen(port, () => {
    console.log("Server listening on port " + port);
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
  });
