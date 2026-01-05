export function getUserId(req) {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new Error('User ID not found in token. Ensure requireAuth middleware is applied.');
  }
  
  return userId;
}

export function getUser(req) {
  if (!req.user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  
  return req.user;
}