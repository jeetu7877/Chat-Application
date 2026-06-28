import Media from "../models/media.model.js";
import cloudinary from "../lib/cloudinary.js";

// हेल्पर फंक्शन: मल्टार मेमोरी बफ़र को क्लाउडिनरी पर स्ट्रीम अपलोड करने के लिए
const streamUpload = (fileBuffer, resourceType) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: "camera_studio",
      },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(fileBuffer);
  });
};

// 1. POST /api/media/upload (Photos के लिए)
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

    // मेमोरी बफ़र से सीधे क्लाउडिनरी पर अपलोड करें
    const result = await streamUpload(req.file.buffer, "image");

    const newMedia = new Media({
      userId: req.user._id,
      mediaUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      mediaType: "image",
      width: result.width || 0,
      height: result.height || 0,
      caption: req.body.caption || "",
      filtersUsed: req.body.filtersUsed || "original",
    });

    await newMedia.save();
    res.status(201).json({ message: "Image uploaded successfully", data: newMedia });
  } catch (error) {
    console.error("Error in uploadImage:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. POST /api/media/upload-video (Videos के लिए)
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No video file uploaded" });

    // वीडियो को क्लाउडिनरी पर स्ट्रीम करें
    const result = await streamUpload(req.file.buffer, "video");

    const newMedia = new Media({
      userId: req.user._id,
      mediaUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      mediaType: "video",
      width: result.width || 0,
      height: result.height || 0,
      duration: Math.round(result.duration) || 0,
      caption: req.body.caption || "",
    });

    await newMedia.save();
    res.status(201).json({ message: "Video uploaded successfully", data: newMedia });
  } catch (error) {
    console.error("Error in uploadVideo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 3. GET /api/media/my-gallery
export const getMyGallery = async (req, res) => {
  try {
    const gallery = await Media.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(gallery);
  } catch (error) {
    console.error("Error in getMyGallery:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 4. DELETE /api/media/:id
export const deleteMedia = async (req, res) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, userId: req.user._id });
    if (!media) return res.status(404).json({ message: "Media not found or unauthorized" });

    // क्लाउडिनरी से फाइल डिलीट करें
    await cloudinary.uploader.destroy(media.cloudinaryPublicId, {
      resource_type: media.mediaType,
    });

    // डेटाबेस से एंट्री डिलीट करें
    await Media.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Media deleted successfully" });
  } catch (error) {
    console.error("Error in deleteMedia:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 5. PUT /api/media/favorite/:id
export const toggleFavorite = async (req, res) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, userId: req.user._id });
    if (!media) return res.status(404).json({ message: "Media not found" });

    media.isFavorite = !media.isFavorite;
    await media.save();

    res.status(200).json({ message: "Favorite status updated", data: media });
  } catch (error) {
    console.error("Error in toggleFavorite:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 6. GET /api/media/favorites
export const getFavorites = async (req, res) => {
  try {
    const favorites = await Media.find({ userId: req.user._id, isFavorite: true }).sort({ createdAt: -1 });
    res.status(200).json(favorites);
  } catch (error) {
    console.error("Error in getFavorites:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 7. GET /api/media/albums
export const getAlbums = async (req, res) => {
  try {
    const userId = req.user._id;

    // अलग-अलग एलबम्स के लिए एक साथ काउन्ट्स और डेटा पैच करें
    const allMedia = await Media.find({ userId }).sort({ createdAt: -1 });
    const photos = allMedia.filter((m) => m.mediaType === "image");
    const videos = allMedia.filter((m) => m.mediaType === "video");
    const favorites = allMedia.filter((m) => m.isFavorite === true);
    const edited = allMedia.filter((m) => m.filtersUsed && m.filtersUsed !== "original");

    res.status(200).json({
      allMedia,
      photos,
      videos,
      favorites,
      edited,
      recent: allMedia.slice(0, 15), // हाल ही के टॉप 15 मीडिया
    });
  } catch (error) {
    console.error("Error in getAlbums:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
