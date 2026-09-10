export class DomainError extends Error {
  constructor(message: string, public readonly code: string = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized action or invalid credentials') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden action') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Resource conflict or duplicate operation') {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message = 'Financial or domain invariant violation') {
    super(message, 'INVARIANT_VIOLATION');
    this.name = 'InvariantViolationError';
  }
}
