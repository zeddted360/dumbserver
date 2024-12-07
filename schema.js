import mongoose from "mongoose";

//user schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  socketId: String,
  onlineStatus: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
});

// message Schema

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: function () {
      return !this.fileUrl; // Content is required only if there's no file
    },
    default: "",
  },
  sender: {
    type: String,
    required: true,
  },
  receiver: {
    type: String,
    required: true,
  },
  conversationId: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  fileUrl: {
    type: String,
    required: function () {
      return !this.content.trim(); // FileUrl is required only if there's no content
    },
    default: "",
  },
});

// conversation schema
const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: String,
      required: true,
    },
  ],
  lastMessage: {
    type: Date,
    default: Date.now,
  },
});

const userModel = mongoose.model("user", userSchema);
const messageModel = mongoose.model("Message", messageSchema);
const conversationModel = mongoose.model("Conversation", conversationSchema);

export { userModel, messageModel, conversationModel };
