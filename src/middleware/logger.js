/**
 * Request logging middleware using morgan
 */
import morgan from "morgan";

// Custom token for user info
morgan.token("user", (req) => {
  return req.user ? `${req.user.email}(${req.user.role})` : "anonymous";
});

// Custom format
const logFormat =
  ":method :url :status :res[content-length] - :response-time ms :user";

// Different formats for different environments
const getLoggerMiddleware = () => {
  if (process.env.NODE_ENV === "production") {
    return morgan("combined");
  } else {
    return morgan(logFormat);
  }
};

export default getLoggerMiddleware;
