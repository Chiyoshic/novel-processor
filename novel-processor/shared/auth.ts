export interface AuthUser { id: number; username: string }
export interface AuthTokens {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  expiresAt: number
  user: AuthUser
}
