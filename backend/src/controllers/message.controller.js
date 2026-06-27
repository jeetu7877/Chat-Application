import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
    try {
        const loggedInUserId = req._id;
        const filteredUserId = await User.find({_id: {$ne: loggedInUserId}}).select("-password");
        res.status(200).json(filteredUserId);
    } catch (error) {
        console.error("Error in getUsersForSidebbar", error.message);
        res.status(500).json({error: "Internal server error"})
    }
};

export const getMessages = async (req, res) => {
    try {
        const {id: userToChatId} = req.params;
        const myId = req.user._id;
        const messages = await Message.find({
            $or:[
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId },
            ],
        })
        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages controller", error.message);
        res.status(500).json({error : "Internal Server Error"});
    }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });
    await newMessage.save();
    const receiverSocketId = getReceiverSocketId(receiverId);
    if(receiverSocketId){
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }
    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Message.findById(id);

    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await Message.findByIdAndDelete(id);

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageDeleted", id);
    }

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    console.log("Error in deleteMessage controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const message = await Message.findById(id);

    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    message.text = text;
    message.isEdited = true;
    await message.save();

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageEdited", message);
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in editMessage controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    await Message.updateMany(
      { 
        senderId: id, 
        receiverId: req.user._id,
        isRead: false 
      },
      { isRead: true }
    );

    const senderSocketId = getReceiverSocketId(id);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messagesRead", { 
        readBy: req.user._id 
      });
    }

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.log("Error in markAsRead controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingIndex !== -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Same emoji → remove karo
        message.reactions.splice(existingIndex, 1);
      } else {
        // Alag emoji → update karo
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      // Nayi reaction add karo
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    // Dono users ko notify karo
    const receiverSocketId = getReceiverSocketId(message.receiverId);
    const senderSocketId = getReceiverSocketId(message.senderId);

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageReaction", {
        messageId: id,
        reactions: message.reactions,
      });
    }
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageReaction", {
        messageId: id,
        reactions: message.reactions,
      });
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in addReaction controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
