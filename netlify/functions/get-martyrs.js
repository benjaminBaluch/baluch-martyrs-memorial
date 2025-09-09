// Get approved martyrs from Firebase
import { getFirestore, handleError, successResponse, handleCORS } from './lib/database.js';

export const handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return handleCORS();
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const db = getFirestore();

    // Get only approved martyrs
    const snapshot = await db
      .collection('martyrs')
      .where('status', '==', 'approved')
      .orderBy('approvedAt', 'desc')
      .get();

    const martyrs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      martyrs.push({
        id: data.id,
        fullName: data.fullName,
        fatherName: data.fatherName,
        birthDate: data.birthDate,
        birthPlace: data.birthPlace,
        martyrdomDate: data.martyrdomDate,
        martyrdomPlace: data.martyrdomPlace,
        biography: data.biography,
        organization: data.organization,
        rank: data.rank,
        familyDetails: data.familyDetails,
        photo: data.photo,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString(),
        approvedAt: data.approvedAt?.toDate?.()?.toISOString(),
        status: 'approved'
      });
    });

    return successResponse(martyrs);

  } catch (error) {
    return handleError(error);
  }
};
