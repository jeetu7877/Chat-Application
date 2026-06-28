import Status from "../models/status.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import User from "../models/user.model.js";
// 🚨 NOTE: Agar tumhara Message model kisi aur path par hai toh path sahi kar lena
import Message from "../models/message.model.js"; 

// ── Upload Status ─────────────────────────────────────────────────────────────
export const uploadStatus = async (req, res) => {
  try {
    const { mediaUrl, mediaType, caption } = req.body;
    const userId = req.user._id;

    if (!mediaUrl || !mediaType) {
      return res.status(400).json({ message: "Media URL and type are required" });
    }

    const resourceType = mediaType === "video" ? "video" : "image";
    const uploaded = await cloudinary.uploader.upload(mediaUrl, {
      resource_type: resourceType,
      folder: "statuses",
    });

    const status = await Status.create({
      user: userId,
      mediaUrl: uploaded.secure_url,
      mediaType,
      caption: caption || "",
      likes: [], // Initializing empty likes array
    });

    await status.populate("user", "fullName profilePic");

    io.emit("status:new", {
      status: {
        _id: status._id,
        user: status.user,
        mediaUrl: status.mediaUrl,
        mediaType: status.mediaType,
        caption: status.caption,
        createdAt: status.createdAt,
        expireAt: status.expireAt,
        viewedBy: [],
        likes: [],
      },
    });

    res.status(201).json(status);
  } catch (error) {
    console.error("Error uploading status:", error);
    res.status(500).json({ message: "Failed to upload status" });
  }
};

// ── Get My Statuses ───────────────────────────────────────────────────────────
export const getMyStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const statuses = await Status.find({
      user: userId,
      expireAt: { $gt: now },
    })
      .populate("user", "fullName profilePic")
      .populate("viewedBy.user", "fullName profilePic")
      .populate("likes", "fullName profilePic") // ✅ NAYA: Likes user detail populate
      .sort({ createdAt: -1 });

    res.status(200).json(statuses);
  } catch (error) {
    console.error("Error fetching my statuses:", error);
    res.status(500).json({ message: "Failed to fetch statuses" });
  }
};

// ── Get Friends' Statuses ─────────────────────────────────────────────────────
export const getFriendsStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const statuses = await Status.find({
      user: { $ne: userId },
      expireAt: { $gt: now },
    })
      .populate("user", "fullName profilePic")
      .populate("likes", "fullName profilePic") // ✅ NAYA: Friend updates me populate likes
      .sort({ createdAt: -1 });

    const grouped = {};
    statuses.forEach((s) => {
      const uid = s.user._id.toString();
      if (!grouped[uid]) {
        grouped[uid] = {
          user: s.user,
          statuses: [],
          latestTime: s.createdAt,
          hasUnseen: false,
        };
      }
      grouped[uid].statuses.push(s);

      const seen = s.viewedBy.some(
        (v) => v.user?.toString() === userId.toString()
      );
      if (!seen) grouped[uid].hasUnseen = true;
    });

    const result = Object.values(grouped).sort(
      (a, b) => new Date(b.latestTime) - new Date(a.latestTime)
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching friends statuses:", error);
    res.status(500).json({ message: "Failed to fetch friends statuses" });
  }
};

// ── Mark Status as Viewed ─────────────────────────────────────────────────────
export const viewStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user._id;

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ message: "Status not found" });

    if (status.user.toString() === userId.toString()) {
      return res.status(200).json({ message: "Own status" });
    }

    const alreadyViewed = status.viewedBy.some(
      (v) => v.user?.toString() === userId.toString()
    );

    if (!alreadyViewed) {
      status.viewedBy.push({ user: userId, viewedAt: new Date() });
      await status.save();

      await status.populate("viewedBy.user", "fullName profilePic");

      const newViewerData = status.viewedBy.find(
        (v) => v.user?._id.toString() === userId.toString()
      );

      const ownerSocketId = getReceiverSocketId(status.user.toString());
      if (ownerSocketId) {
        io.to(ownerSocketId).emit("status:viewed", {
          statusId,
          viewer: newViewerData, 
        });
      }
    }

    await status.populate("viewedBy.user", "fullName profilePic");
    await status.populate("likes", "fullName profilePic"); // Sync likes info
    res.status(200).json(status);
  } catch (error) {
    console.error("Error viewing status:", error);
    res.status(500).json({ message: "Failed to mark status as viewed" });
  }
};

// ── NAYA: Toggle Like Status ──────────────────────────────────────────────────
export const toggleLikeStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user._id;

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ message: "Status not found" });

    const likeIndex = status.likes.indexOf(userId);
    let isLiked = false;

    if (likeIndex === -1) {
      status.likes.push(userId);
      isLiked = true;
    } else {
      status.likes.splice(likeIndex, 1);
    }

    await status.save();
    await status.populate("likes", "fullName profilePic");

    // Socket to notify status owner and viewers instantly
    io.emit("status:liked", {
      statusId,
      likes: status.likes,
      userId,
    });

    res.status(200).json({ message: isLiked ? "Status liked" : "Status unliked", likes: status.likes });
  } catch (error) {
    console.error("Error toggling status like:", error);
    res.status(500).json({ message: "Failed to handle like execution" });
  }
};

// ── NAYA: Reply to Status (WhatsApp Style Chat injection) ────────────────────
export const replyStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const { text } = req.body; // Custom message text sent from bottom sheet input
    const senderId = req.user._id;

    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Reply text cannot be empty" });
    }

    const status = await Status.findById(statusId).populate("user");
    if (!status) return res.status(404).json({ message: "Status not found" });

    const receiverId = status.user._id;

    // Construct reply dynamic contextual bubble message formatting for existing core chat scheme
    const formattedText = `💬 Replied to status:\n"${text}"`;

    // Normal message collection instance creation mechanism
    const newMessage = await Message.create({
      senderId,
      receiverId,
      text: formattedText,
      // Optional fields: Agar message model image attachments link arrays support karta ho
      image: status.mediaType === "image" ? status.mediaUrl : null, 
    });

    // Notify user directly inside specific room channel execution
    const receiverSocketId = getReceiverSocketId(receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json({ message: "Reply sent as a message", chatMessage: newMessage });
  } catch (error) {
    console.error("Error replying to status:", error);
    res.status(500).json({ message: "Failed to process reply text delivery" });
  }
};

// ── Delete Status ─────────────────────────────────────────────────────────────
export const deleteStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user._id;

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ message: "Status not found" });

    if (status.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    try {
      const urlParts = status.mediaUrl.split("/");
      const publicIdWithExt = urlParts.slice(-2).join("/");
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
      await cloudinary.uploader.destroy(publicId, {
        resource_type: status.mediaType === "video" ? "video" : "image",
      });
    } catch (cloudErr) {
      console.error("Cloudinary delete error:", cloudErr);
    }

    await Status.findByIdAndDelete(statusId);

    io.emit("status:deleted", { statusId });

    res.status(200).json({ message: "Status deleted" });
  } catch (error) {
    console.error("Error deleting status:", error);
    res.status(500).json({ message: "Failed to delete status" });
  }
};
