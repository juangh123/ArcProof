// Errors that are safe to show to the person who triggered the request.
// Anything else must be logged server-side and replaced with a generic
// message so internal details (provider, parser, database) never leak.
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
