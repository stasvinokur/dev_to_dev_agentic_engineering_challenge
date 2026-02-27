// Empty function body (S1186)
export function onInit() {}
export function onDestroy() {}

// Use of 'any' type, no return type
export function parseRequest(raw: any) {
  // Redundant boolean literal (S1125)
  const isValid = raw.token !== undefined ? true : false;

  // Dead code / unreachable (S1763)
  if (!isValid) {
    throw new Error("Invalid request");
    console.log("This will never execute");
  }

  // Identical expressions on both sides (S1764)
  const timeout = raw.timeout || raw.timeout;

  // Unused parameter
  const _extra = raw.extra;

  return {
    token: raw.token,
    body: raw.body,
    timeout: timeout,
  };
}

// Function with too many parameters (S107)
export function createReport(
  title: string,
  description: string,
  author: string,
  date: string,
  category: string,
  priority: number,
  tags: string[],
  assignee: string,
) {
  return {
    title,
    description,
    author,
    date,
    category,
    priority,
    tags,
    assignee,
    createdAt: new Date().toISOString(),
  };
}
