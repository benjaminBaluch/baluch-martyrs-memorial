// Get pending martyrs from Firebase
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

    // Get pending martyrs with all details for admin review
    const snapshot = await db
      .collection('martyrs')
      .where('status', '==', 'pending')
      .orderBy('submittedAt', 'desc')
      .get();

    const pendingMartyrs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      pendingMartyrs.push({
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
        submitterName: data.submitterName,
        submitterEmail: data.submitterEmail,
        submitterRelation: data.submitterRelation,
        submittedAt: data.submittedAt?.toDate?.()?.toISOString(),
        status: 'pending'
      });
    });

    return successResponse(pendingMartyrs);

  } catch (error) {
    return handleError(error);
  }
};
