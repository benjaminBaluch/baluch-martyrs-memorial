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

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
    const JWT_SECRET = process.env.JWT_SECRET;

    // GET /api/admin-login -> Verify existing JWT token
    if (event.httpMethod === 'GET') {
        if (!JWT_SECRET) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, valid: false, error: 'Server is not configured' })
            };
        }
        const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : (event.headers?.['x-admin-token'] || '');
        const decoded = token ? verifyToken(token, JWT_SECRET) : null;
        if (!decoded || decoded.role !== 'admin' || decoded.username !== ADMIN_USERNAME) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, valid: false, error: 'Invalid or expired admin token' })
            };
        }
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                valid: true,
                username: decoded.username,
                role: decoded.role,
                exp: decoded.exp,
                expiresIn: Math.max(0, decoded.exp - Date.now())
            })
        };
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
        
        if (!ADMIN_PASSWORD_HASH || !JWT_SECRET) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server is not configured' })
            };
        }
        
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
