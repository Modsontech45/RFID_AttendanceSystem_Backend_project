const messages = {
  en: {
    categoryCreated: 'Category created',
    categoryRequired: 'Category name is required.',
    onlyAdmins: 'Only admins can perform this action.',
    internalError: 'Internal server error',
    notFoundOrUnauthorized: 'Category not found or unauthorized.',
    deletedSuccess: 'Category deleted successfully.',
  },
  fr: {
    categoryCreated: 'Catégorie créée',
    categoryRequired: 'Le nom de la catégorie est requis.',
    onlyAdmins: 'Seuls les administrateurs peuvent effectuer cette action.',
    internalError: 'Erreur interne du serveur',
    notFoundOrUnauthorized: 'Catégorie introuvable ou non autorisée.',
    deletedSuccess: 'Catégorie supprimée avec succès.',
  }
};

module.exports = function getMessage(lang = 'en', key) {
  return messages[lang]?.[key] || messages['en'][key] || key;
};
