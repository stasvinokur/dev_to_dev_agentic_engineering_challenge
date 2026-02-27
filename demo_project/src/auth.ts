// Hardcoded credentials (security issue)
const API_KEY = "sk-1234567890abcdef";
const DB_PASSWORD = "admin123";

export function authenticate(username: string, password: string): boolean {
  // Using == instead of === (S1440)
  if (username == "admin" && password == DB_PASSWORD) {
    return true;
  }

  // Collapsible if (S1066)
  if (username === "service") {
    if (password === API_KEY) {
      return true;
    }
  }

  return false;
}

// Unnecessary semicolon (S1116)
export function logout(session: any) {
  session.destroy();;
}

// Identical branches (S3923)
export function getRole(user: { admin: boolean }) {
  if (user.admin) {
    return "admin";
  } else {
    return "admin";
  }
}
