import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email address",
      ],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10,11}$/, "Phone number must be 10-11 digits"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      required: [true, "Role is required"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "locked"],
        message: "{VALUE} is not a valid status",
      },
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ fullName: "text" });
UserSchema.index({ status: 1 });
UserSchema.index({ role: 1 });

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from returned JSON
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Virtual for status display
UserSchema.virtual("statusDisplay").get(function () {
  return {
    text: this.status,
    color: this.status === "active" ? "green" : "red",
    badge: this.status === "active" ? "success" : "danger",
  };
});

// Static search
UserSchema.statics.searchUsers = function (searchTerm, options = {}) {
  const {
    page = 1,
    limit = 25,
    sortBy = "createdAt",
    sortOrder = "desc",
    status,
    role,
  } = options;

  const query = {};

  if (searchTerm) {
    query.$or = [
      { fullName: { $regex: searchTerm, $options: "i" } },
      { username: { $regex: searchTerm, $options: "i" } },
      { email: { $regex: searchTerm, $options: "i" } },
    ];
  }

  if (status) query.status = status;
  if (role) query.role = role;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  return this.find(query)
    .select("-password")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "username fullName")
    .populate("updatedBy", "username fullName");
};

// Static count
UserSchema.statics.countUsers = function (searchTerm, status, role) {
  const query = {};

  if (searchTerm) {
    query.$or = [
      { fullName: { $regex: searchTerm, $options: "i" } },
      { username: { $regex: searchTerm, $options: "i" } },
      { email: { $regex: searchTerm, $options: "i" } },
    ];
  }

  if (status) query.status = status;
  if (role) query.role = role;

  return this.countDocuments(query);
};

export default mongoose.model("User", UserSchema);