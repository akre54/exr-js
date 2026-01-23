// Custom error types for EXR operations

// Error for unsupported EXR features
export class NotSupportedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NotSupportedError'
  }
}

// Error for invalid EXR data
export class InvalidDataError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidDataError'
  }
}

// Error for I/O operations
export class IOError extends Error {
  constructor(message, cause = null) {
    super(message)
    this.name = 'IOError'
    this.cause = cause
  }
}

// Validate a condition or throw InvalidDataError
// @param {boolean} condition
// @param {string} message
export function validateData(condition, message) {
  if (!condition) {
    throw new InvalidDataError(message)
  }
}

// Validate that a value is within range
// @param {number} value
// @param {number} min
// @param {number} max
// @param {string} name
export function validateRange(value, min, max, name) {
  if (value < min || value > max) {
    throw new InvalidDataError(
      `${name} must be between ${min} and ${max}, got ${value}`,
    )
  }
}

// Validate that a string is not empty
// @param {string} value
// @param {string} name
export function validateNonEmpty(value, name) {
  if (!value || value.length === 0) {
    throw new InvalidDataError(`${name} must not be empty`)
  }
}

// Validate channel name is valid (alphanumeric, dots, underscores)
// @param {string} name
export function validateChannelName(name) {
  validateNonEmpty(name, 'Channel name')
  // EXR allows most characters except null bytes
  if (name.includes('\0')) {
    throw new InvalidDataError('Channel name cannot contain null bytes')
  }
}
