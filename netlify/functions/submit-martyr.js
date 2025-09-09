const { MongoClient } = require('mongodb');

// For now, we'll use a simple JSON file storage approach
// In production, you should replace this with a proper database like MongoDB Atlas
let martyrsData = [];

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    if (event.httpMethod === 'POST') {
      const martyrData = JSON.parse(event.body);
      
      // Validate required fields
      if (!martyrData.firstName || !martyrData.lastName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'First name and last name are required' 
          })
        };
      }

      // Add timestamp and pending status
      const newMartyr = {
        ...martyrData,
        id: Date.now().toString(),
        submittedAt: new Date().toISOString(),
        status: 'pending_verification'
      };

      // In a real application, save to database here
      // For now, we'll just return success
      martyrsData.push(newMartyr);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: 'Martyr information submitted successfully',
          id: newMartyr.id
        })
      };
    }

    if (event.httpMethod === 'GET') {
      // Return approved martyrs only
      const approvedMartyrs = martyrsData.filter(m => m.status === 'approved');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(approvedMartyrs)
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
