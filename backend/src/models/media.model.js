import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    width: {
      type: Number,
      default: 0,
    },
    height: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0, // केवल वीडियो फाइल्स के लिए (सेकंड्स में)
    },
    caption: {
      type: String,
      default: "",
    },
    filtersUsed: {
      type: String,
      default: "original",
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  { 
    timestamps: true 
  }
);

// परफॉरमेंस और एलबम फिल्टरिंग को फ़ास्ट करने के लिए कंपाउंड इंडेक्स
mediaSchema.index({ userId: 1, isFavorite: -1 });
mediaSchema.index({ userId: 1, mediaType: 1 });

const Media = mongoose.model("Media", mediaSchema);

export default Media;
