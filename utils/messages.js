const messages = {
  en: {
    category: {
      categoryCreated: 'Category created',
      categoryRequired: 'Category name is required.',
      onlyAdmins: 'Only admins can perform this action.',
      internalError: 'Internal server error',
      notFoundOrUnauthorized: 'Category not found or unauthorized.',
      deletedSuccess: 'Category deleted successfully.',
    },
    device: {
      missing_fields: "Missing required fields.",
      already_registered: "Device already registered.",
      created: "Device registered successfully.",
      deleted: "Device deleted successfully.",
      not_found_or_unauthorized: "Device not found or unauthorized.",
      not_found_or_invalid_api: "Device not found or invalid API key.",
      missing_uid_or_api: "Missing device UID or API key.",
      missing_api_key: "Missing API key",
      fetch_failed: "Failed to fetch devices.",
      delete_failed: "Failed to delete device.",
      update_failed: "Failed to update device status.",
      marked_online: "Device marked as online."
    },
    auth: {
  noToken: 'No token provided',
  invalidToken: 'Invalid token',
  accessDenied: 'Access denied',
},
 api: {
      required: "API key required",
      invalid: "Invalid API key",
      error: "Server error validating API key",
    },
     attendance: {
      noApiKey: "No API key found",
      noneForKey: "No attendance data for your API key",
      serverError: "Internal server error",
    },
      register: {
      allFieldsRequired: 'All fields (including API key) are required.',
      invalidApiKey: 'Invalid or unverified API key.',
      uidExists: 'UID already registered.',
      success: 'Student registered successfully.',
      failed: 'Registration failed.'
    },
    scan: {
  missingFields: 'uid and device_uid are required.',
  uidNotRegistered: 'New UID - Registration required',
  registerNow: 'Register now',
  outsideTime: 'Outside allowed sign-in/sign-out time',
  outsideFlag: 'Outside Time',
  signInFirst: 'Sign-in required before sign-out',
  signInFlag: 'SignIn 1st',
  signedIn: 'Signed in',
  signedOut: 'Signed out',
  error: 'Error during scan processing',
  failed: 'Scan failed',
  deviceRequired: 'device_uid is required'
},
students: {
  noApiKey: 'No API key found for user',
  noStudentsFound: 'No students found with your API key',
  invalidUidUpdate: 'Invalid UID update request.',
  studentNotFound: 'Student not found',
  uidUpdateSubject: 'UID Update Confirmation',
  uidUpdateText: (oldUid, newUid) =>
    `Your UID has been successfully updated from ${oldUid} to ${newUid}.\n\nIf you did not authorize this change, please contact your school immediately.`,
  contactSupport: 'You can reach us at rocklegacy@gmail.com or call +228 93 94 60 43 for assistance.',
  uidUpdateSuccess: (email) => `UID updated and email sent to ${email}`,
  uidUpdateFailed: 'UID update failed'
},
admin: {
  requiredFields: 'All fields are required',
  alreadyExists: 'Admin already exists',
  signupSuccess: 'Admin created. Please check your email to verify your account.',
  verifyInstruction: 'Thank you for signing up. Please click the button below to verify your email:',
  verifyEmail: 'Verify Email',
  ignoreEmail: 'If you didn’t sign up, you can safely ignore this email.',
  verifySubject: 'Verify Your Email Address',
  invalidToken: 'Invalid or expired token',
  verifiedSuccess: 'Email verified successfully. You can now log in.',
  emailPasswordRequired: 'Email and password are required',
  invalidCredentials: 'Invalid credentials',
  notVerified: 'Please verify your email before logging in.',
  loginSuccess: 'Login successful'
},
reset: {
  subject: 'Password Reset Request',
  requested: 'You requested a password reset.',
  clickHere: 'Click here to reset your password.',
  expiry: 'This link expires in 15 minutes.',
  notFound: 'No user found with that email',
  sent: 'Reset link sent to your email',
  success: 'Password reset successful',
  invalidToken: 'Invalid or expired token',
},
teacher: {
  exists: "Teacher already exists",
  added: "Teacher added and notified",
  noApiKey: "API key not found for admin",
  welcomeSubject: "Welcome to the Team",
  welcomeBody: "Hello! You have been added as a teacher. Login at: https://www.rfid-attendance-synctuario-theta.vercel.app",
  loginSuccess: "Login successful",
  adminOnly: "Only admins can view this resource",
  notFound: "Teacher not found",
  notFoundOrUnauthorized: "Teacher not found or unauthorized action.",
  removalSubject: "Teacher Account Removed",
  removalBody: "You have been removed by your admin. Contact them if this is a mistake.",
  deleted: "Teacher deleted successfully.",
  updated: "Profile updated",
  nothingToUpdate: "Nothing to update"
}




  },





  fr: {
    category: {
      categoryCreated: 'Catégorie créée',
      categoryRequired: 'Le nom de la catégorie est requis.',
      onlyAdmins: 'Seuls les administrateurs peuvent effectuer cette action.',
      internalError: 'Erreur interne du serveur',
      notFoundOrUnauthorized: 'Catégorie introuvable ou non autorisée.',
      deletedSuccess: 'Catégorie supprimée avec succès.',
    },
    device: {
      missing_fields: "Champs obligatoires manquants.",
      already_registered: "Appareil déjà enregistré.",
      created: "Appareil enregistré avec succès.",
      deleted: "Appareil supprimé avec succès.",
      not_found_or_unauthorized: "Appareil introuvable ou non autorisé.",
      not_found_or_invalid_api: "Appareil introuvable ou clé API invalide.",
      missing_uid_or_api: "UID ou clé API manquant.",
      missing_api_key: "Clé API manquante",
      fetch_failed: "Échec du chargement des appareils.",
      delete_failed: "Échec de la suppression de l'appareil.",
      update_failed: "Échec de la mise à jour de l'appareil.",
      marked_online: "Appareil marqué comme en ligne."
    },
    auth: {
  noToken: 'Aucun jeton fourni',
  invalidToken: 'Jeton invalide',
  accessDenied: 'Accès refusé',
},
 api: {
      required: "Clé API requise",
      invalid: "Clé API invalide",
      error: "Erreur serveur lors de la validation de la clé API",
    },
     attendance: {
      noApiKey: "Aucune clé API trouvée",
      noneForKey: "Aucune donnée de présence pour votre clé API",
      serverError: "Erreur interne du serveur",
    },
     register: {
      allFieldsRequired: 'Tous les champs (y compris la clé API) sont requis.',
      invalidApiKey: 'Clé API invalide ou non vérifiée.',
      uidExists: 'UID déjà enregistré.',
      success: 'Étudiant enregistré avec succès.',
      failed: "L'enregistrement a échoué."
    },
   scan: {
  missingFields: 'uid et device_uid sont requis.',
  uidNotRegistered: 'Nouvel UID - Enregistrement requis',
  registerNow: 'Enregistrez maintenant',
  outsideTime: 'En dehors des heures autorisées de pointage',
  outsideFlag: 'Hors temps',
  signInFirst: 'Connexion requise avant déconnexion',
  signInFlag: 'Connectez-vous d\'abord',
  signedIn: 'Connecté',
  signedOut: 'Déconnecté',
  error: 'Erreur lors du traitement du scan',
  failed: 'Échec du scan',
  deviceRequired: 'device_uid est requis'
},
students: {
  noApiKey: 'Aucune clé API trouvée pour cet utilisateur',
  noStudentsFound: 'Aucun élève trouvé pour votre clé API',
  invalidUidUpdate: 'Requête de mise à jour UID invalide.',
  studentNotFound: 'Élève introuvable',
  uidUpdateSubject: 'Confirmation de mise à jour de l’UID',
  uidUpdateText: (oldUid, newUid) =>
    `Votre UID a été mis à jour avec succès de ${oldUid} à ${newUid}.\n\nSi vous n’avez pas autorisé ce changement, veuillez contacter votre école immédiatement.`,
  contactSupport: 'Vous pouvez nous contacter à rocklegacy@gmail.com ou appeler le +228 93 94 60 43 pour obtenir de l’aide.',
  uidUpdateSuccess: (email) => `UID mis à jour et email envoyé à ${email}`,
  uidUpdateFailed: 'Échec de la mise à jour de l’UID'
},
admin: {
  requiredFields: 'Tous les champs sont requis',
  alreadyExists: "L'administrateur existe déjà",
  signupSuccess: 'Administrateur créé. Veuillez vérifier votre e-mail pour activer votre compte.',
  verifyInstruction: 'Merci de vous être inscrit. Cliquez sur le bouton ci-dessous pour vérifier votre adresse e-mail :',
  verifyEmail: 'Vérifier l’e-mail',
  ignoreEmail: 'Si vous ne vous êtes pas inscrit, vous pouvez ignorer cet e-mail.',
  verifySubject: 'Vérifiez votre adresse e-mail',
  invalidToken: 'Token invalide ou expiré',
  verifiedSuccess: 'E-mail vérifié avec succès. Vous pouvez maintenant vous connecter.',
  emailPasswordRequired: "L’e-mail et le mot de passe sont requis",
  invalidCredentials: 'Identifiants invalides',
  notVerified: 'Veuillez vérifier votre e-mail avant de vous connecter.',
  loginSuccess: 'Connexion réussie'
},
reset: {
  subject: 'Demande de réinitialisation du mot de passe',
  requested: 'Vous avez demandé une réinitialisation de mot de passe.',
  clickHere: 'Cliquez ici pour réinitialiser votre mot de passe.',
  expiry: 'Ce lien expire dans 15 minutes.',
  notFound: 'Aucun utilisateur trouvé avec cet e-mail',
  sent: 'Lien de réinitialisation envoyé à votre e-mail',
  success: 'Réinitialisation du mot de passe réussie',
  invalidToken: 'Lien invalide ou expiré',
},
teacher: {
  exists: "L'enseignant existe déjà",
  added: "Enseignant ajouté et notifié",
  noApiKey: "Clé API introuvable pour l'administrateur",
  welcomeSubject: "Bienvenue dans l’équipe",
  welcomeBody: "Bonjour ! Vous avez été ajouté en tant qu'enseignant. Connectez-vous : https://www.rfid-attendance-synctuario-theta.vercel.app",
  loginSuccess: "Connexion réussie",
  adminOnly: "Seuls les administrateurs peuvent consulter cette ressource",
  notFound: "Enseignant introuvable",
  notFoundOrUnauthorized: "Enseignant introuvable ou action non autorisée.",
  removalSubject: "Compte enseignant supprimé",
  removalBody: "Vous avez été retiré du système. Contactez votre administrateur si c'est une erreur.",
  deleted: "Enseignant supprimé avec succès.",
  updated: "Profil mis à jour",
  nothingToUpdate: "Aucune donnée à mettre à jour"
}



  }
};

module.exports = function getMessage(lang = 'en', key) {
  const parts = key.split('.');
  return parts.reduce((obj, part) => obj && obj[part], messages[lang]) || messages.en?.[key] || key;
};
