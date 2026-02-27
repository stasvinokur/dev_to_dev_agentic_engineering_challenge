// Unused variables (S1481)
const unusedConfig = { debug: true, verbose: false };
const UNUSED_CONSTANT = 42;

export function processData(items: any[]) {
  const temp = "this is never used";
  let counter = 0;

  for (let i = 0; i < items.length; i++) {
    // Cognitive complexity issue (S3776) - deeply nested
    if (items[i]) {
      if (items[i].type === "A") {
        if (items[i].status === "active") {
          if (items[i].priority > 5) {
            if (items[i].assignee) {
              counter++;
              console.log("Found item: " + items[i].name);
            }
          }
        }
      } else if (items[i].type === "B") {
        if (items[i].status === "pending") {
          if (items[i].priority > 3) {
            counter++;
          }
        }
      }
    }
  }

  return counter;
}

// Duplicate string literal (S1192)
export function getStatus(code: number): string {
  if (code === 200) return "SUCCESS";
  if (code === 201) return "SUCCESS";
  if (code === 204) return "SUCCESS";
  if (code === 400) return "BAD_REQUEST";
  if (code === 401) return "UNAUTHORIZED";
  if (code === 403) return "UNAUTHORIZED";
  if (code === 404) return "NOT_FOUND";
  if (code === 500) return "SERVER_ERROR";
  if (code === 502) return "SERVER_ERROR";
  if (code === 503) return "SERVER_ERROR";
  return "UNKNOWN";
}
