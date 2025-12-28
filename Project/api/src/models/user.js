import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {
        type: String, 
        unique: true, 
        index: true, 
        required: true, 
        lowercase: true, 
        trim: true
    },
    passwordHash: {
        type: String, 
        required: true
    },
    preferences: {
        alertThreshold: {type: Number, default: 3},
        emailEnabled: {type: Boolean, default: true}
    }
}, {timestamps: true});

// Pre-save hook to ensure email is always normalized
userSchema.pre('save', function(next) {
    if (this.email) {
        this.email = this.email.toLowerCase().trim();
    }
    next();
});

export default mongoose.model('User', userSchema);