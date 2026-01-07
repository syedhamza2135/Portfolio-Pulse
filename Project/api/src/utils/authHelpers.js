export function getUserId(reqOrContext) {
  // Handle both REST requests and GraphQL context
  const user = reqOrContext.user;
  
  if (!user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  
  // Use 'sub' consistently (JWT standard)
  const userId = user.sub;
  
  if (!userId) {
    throw new Error('User ID not found in token.');
  }
  
  return userId;
}

export function getUser(reqOrContext) {
  const user = reqOrContext.user;
  
  if (!user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  
  return user;
}