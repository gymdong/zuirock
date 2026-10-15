/** Thrown by rule stubs until lane LA implements them (D4 gate: zero occurrences, CI grep). */
export class NotImplementedError extends Error {
  constructor(name: string) {
    super(`${name} is not implemented`);
    this.name = 'NotImplementedError';
  }
}
