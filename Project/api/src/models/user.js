import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {type: String, unique: true, index: true, required: true},
    passwordHash: {type: String, required: true},
    preferences: {
        alertThreshold: {type: Number, default: 3},
        emailEnabled: {type: Boolean, default: true}
    }
}, {timestamps: true});

export default mongoose.model('User', userSchema);