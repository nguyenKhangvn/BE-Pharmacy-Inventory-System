class ApiResponse {
  static success(res, data, message = "Success", statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, message = "Error", statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }

  static paginated(res, data, pagination, message = "Success") {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination,
    });
  }
}

export default ApiResponse;
