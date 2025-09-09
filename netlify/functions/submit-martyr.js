// Submit new martyr for Firebase Firestore
import admin from 'firebase-admin';
import { getFirestore, handleError, successResponse, handleCORS } from './lib/database.js';

export const handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return handleCORS();
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const db = getFirestore();
    const data = JSON.parse(event.body);

    // Generate unique ID
    const id = `martyr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare data for Firestore
    const martyrData = {
      id,
      fullName: data.fullName,
      fatherName: data.fatherName || null,
      birthDate: data.birthDate || null,
      birthPlace: data.birthPlace || null,
      martyrdomDate: data.martyrdomDate,
      martyrdomPlace: data.martyrdomPlace,
      biography: data.biography || null,
      organization: data.organization || null,
      rank: data.rank || null,
      familyDetails: data.familyDetails || null,
      photo: data.photo || null, // base64 image data
      submitterName: data.submitterName,
      submitterEmail: data.submitterEmail,
      submitterRelation: data.submitterRelation || null,
      status: 'pending',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add to Firestore
    await db.collection('martyrs').doc(id).set(martyrData);

    return successResponse({
      success: true,
      message: 'Submission received and pending review',
      id: martyrData.id,
    });

  } catch (error) {
    return handleError(error);
  }
};
