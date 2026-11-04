// Admin Login Netlify Function
// Handles secure server-side authentication

import crypto from 'crypto';

// JWT-like token generation (simple implementation)
function generateToken(payload, secret, expiresIn = '4h') {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    
    const exp = Date.now() + (parseInt(expiresIn) * 60 * 60 * 1000);
    const tokenPayload = { ...payload, exp, iat: Date.now() };
    const payloadBase64 = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payloadBase64}`)
        .digest('base64url');
    
    return `${header}.${payloadBase64}.${signature}`;
}

// Verify token
function verifyToken(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const [header, payload, signature] = parts;
        
        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${payload}`)
            .digest('base64url');
        
        if (signature !== expectedSignature) return null;
        
        // Decode and check expiration
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (decoded.exp < Date.now()) return null;
        
        return decoded;
    } catch (e) {
        return null;
    }
}

// Hash password with SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

export const handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    try {
        const { username, password } = JSON.parse(event.body || '{}');
        
        // Validate input
        if (!username || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Username and password required' })
            };
        }
        
        // Get credentials from environment variables (set in Netlify dashboard)
        const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
        const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
        const JWT_SECRET = process.env.JWT_SECRET || 'baluch-martyrs-memorial-secret-key-change-in-production';
        
        // Hash the provided password
        const providedHash = hashPassword(password);
        
        // Validate credentials
        if (username !== ADMIN_USERNAME || providedHash !== ADMIN_PASSWORD_HASH) {
            // Log failed attempt (without exposing details)
            console.log(`Failed login attempt for user: ${username}`);
            
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid credentials' })
            };
        }
        
        // Generate JWT token
        const token = generateToken(
            { username, role: 'admin' },
            JWT_SECRET,
            '4h'
        );
        
        console.log(`Successful login for: ${username}`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                token,
                expiresIn: 4 * 60 * 60 * 1000, // 4 hours in ms
                username
            })
        };
        
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

// Export verifyToken for use by other functions
export { verifyToken };
