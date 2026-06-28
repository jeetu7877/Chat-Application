import mongoose from "mongoose";

const statusSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    caption: {
      type: String,
      default: "",
      maxlength: 500,
    },
    viewedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  },
  { timestamps: true }
);

// ✅ Auto delete after 24 hours using MongoDB TTL index
statusSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const Status = mongoose.model("Status", statusSchema);
export default Status;
