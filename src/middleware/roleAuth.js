/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of allowed roles
 * @returns {Function} Express middleware function
 */
const roleAuth = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user exists (should be set by auth middleware)
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      // Check if user role is in allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Insufficient permissions.",
        });
      }

      next();
    } catch (error) {
      console.error("Role auth error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  };
};

export default roleAuth;
