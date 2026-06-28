import Status from "../models/status.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import User from "../models/user.model.js";

// ── Upload Status ─────────────────────────────────────────────────────────────
export const uploadStatus = async (req, res) => {
  try {
    const { mediaUrl, mediaType, caption } = req.body;
    const userId = req.user._id;

    if (!mediaUrl || !mediaType) {
      return res.status(400).json({ message: "Media URL and type are required" });
    }

    // Cloudinary pe upload karo
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
    });

    // Populate user info
    await status.populate("user", "fullName profilePic");

    // ✅ Socket.io — friends ko instantly notify karo
    // User ke saare friends dhundho
    const currentUser = await User.findById(userId);
    // Friends = jo log is user se connected hain (messages/users list)
    // Simple approach: sabko broadcast karo (unread status update)
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

    // Saare users ke statuses fetch karo (except self)
    // Group by user — latest first
    const statuses = await Status.find({
      user: { $ne: userId },
      expireAt: { $gt: now },
    })
      .populate("user", "fullName profilePic")
      .sort({ createdAt: -1 });

    // Group by userId
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

      // Check if current user has seen this status
      const seen = s.viewedBy.some(
        (v) => v.user?.toString() === userId.toString()
      );
      if (!seen) grouped[uid].hasUnseen = true;
    });

    // Array mein convert karo, newest first
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
// ── Mark Status as Viewed ─────────────────────────────────────────────────────
export const viewStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user._id;

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ message: "Status not found" });

    // ← Apna khud ka status view mat karo
    if (status.user.toString() === userId.toString()) {
      return res.status(200).json({ message: "Own status" });
    }

    const alreadyViewed = status.viewedBy.some(
      (v) => v.user?.toString() === userId.toString()
    );

    if (!alreadyViewed) {
      status.viewedBy.push({ user: userId, viewedAt: new Date() });
      await status.save();

      const ownerSocketId = getReceiverSocketId(status.user.toString());
      if (ownerSocketId) {
        io.to(ownerSocketId).emit("status:viewed", {
          statusId,
          viewedBy: userId,
        });
      }
    }

    res.status(200).json({ message: "Status viewed" });
  } catch (error) {
    console.error("Error viewing status:", error);
    res.status(500).json({ message: "Failed to mark status as viewed" });
  }
};
// ── Delete Status ─────────────────────────────────────────────────────────────
export const deleteStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user._id;

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ message: "Status not found" });

    // Sirf apna status delete kar sakte ho
    if (status.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Cloudinary se bhi delete karo
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

    // Socket — friends ko batao status delete hua
    io.emit("status:deleted", { statusId });

    res.status(200).json({ message: "Status deleted" });
  } catch (error) {
    console.error("Error deleting status:", error);
    res.status(500).json({ message: "Failed to delete status" });
  }
};
