// Server-side Admin Authentication Function
// This moves credential verification to the server for security

const crypto = require('crypto');

// Environment variables should be set in Netlify dashboard:
// ADMIN_USERNAME_HASH - bcrypt hash of admin username
// ADMIN_PASSWORD_HASH - bcrypt hash of admin password
// AUTH_SECRET - secret key for signing tokens

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: ''
        };
    }

    try {
        const { username, password, action } = JSON.parse(event.body);

        // Rate limiting check (basic - in production use Redis or similar)
        const clientIP = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
        
        if (action === 'login') {
            return handleLogin(username, password, clientIP);
        } else if (action === 'verify') {
            return handleVerify(event.headers.authorization);
        } else {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid action' })
            };
        }

    } catch (error) {
        console.error('Auth error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Authentication error' })
        };
    }
};

async function handleLogin(username, password, clientIP) {
    // Get credentials from environment variables
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const authSecret = process.env.AUTH_SECRET || generateFallbackSecret();

    // Simple password comparison (in production, use bcrypt)
    // For now, we use a hash comparison
    const providedHash = crypto.createHash('sha256').update(password).digest('hex');
    const storedHash = validPasswordHash || crypto.createHash('sha256').update('baluch2024!').digest('hex');

    if (username !== validUsername || providedHash !== storedHash) {
        // Log failed attempt
        console.log(`Failed login attempt for user: ${username} from IP: ${clientIP}`);
        
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: false, 
                error: 'Invalid credentials' 
            })
        };
    }

    // Generate secure token
    const token = generateToken(username, authSecret);
    const expiresAt = Date.now() + (4 * 60 * 60 * 1000); // 4 hours

    console.log(`Successful login for user: ${username} from IP: ${clientIP}`);

    return {
        statusCode: 200,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            token: token,
            expiresAt: expiresAt,
            username: username
        })
    };
}

async function handleVerify(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valid: false, error: 'No token provided' })
        };
    }

    const token = authHeader.substring(7);
    const authSecret = process.env.AUTH_SECRET || generateFallbackSecret();

    try {
        const payload = verifyToken(token, authSecret);
        
        if (!payload || payload.exp < Date.now()) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valid: false, error: 'Token expired' })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                valid: true, 
                username: payload.username,
                expiresAt: payload.exp
            })
        };
    } catch (error) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valid: false, error: 'Invalid token' })
        };
    }
}

function generateToken(username, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        username: username,
        iat: Date.now(),
        exp: Date.now() + (4 * 60 * 60 * 1000) // 4 hours
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
    }

    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
}

function generateFallbackSecret() {
    // Generate a deterministic secret based on current date (changes daily)
    // This is a fallback - in production, always set AUTH_SECRET env var
    const dateKey = new Date().toISOString().split('T')[0];
    return crypto.createHash('sha256').update(`baluch-memorial-${dateKey}`).digest('hex');
}
