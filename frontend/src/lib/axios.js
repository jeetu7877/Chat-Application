import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: import.meta.env.MODE === "development" 
    ? "http://localhost:5001/api" 
    : "https://chat-application-r793.onrender.com/api",   // ✅ /api add kiya
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});
