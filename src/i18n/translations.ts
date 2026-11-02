export type Language = 'en' | 'es';

export interface Translations {
  appName: string;
  searchPlaceholder: string;
  addApp: string;
  resetDefaults: string;
  switchTheme: string;
  cloudSynced: string;
  categories: {
    All: string;
    Social: string;
    Productivity: string;
    Utilities: string;
    Media: string;
    News: string;
    Games: string;
    Custom: string;
  };
  card: {
    launch: string;
    edit: string;
    delete: string;
    inAppEmbed: string;
    copyLink: string;
    copied: string;
    hasCredentials: string;
  };
  viewer: {
    backToLauncher: string;
    refresh: string;
    loading: string;
    connectingTo: string;
    copyUser: string;
    copyPass: string;
    userCopied: string;
    passCopied: string;
  };
  modal: {
    addTitle: string;
    editTitle: string;
    subtitle: string;
    quickSuggestions: string;
    urlLabel: string;
    urlPlaceholder: string;
    nameLabel: string;
    namePlaceholder: string;
    iconLabel: string;
    iconPlaceholder: string;
    categoryLabel: string;
    colorLabel: string;
    descLabel: string;
    descPlaceholder: string;
    credentialsSection: string;
    credentialsDesc: string;
    usernameLabel: string;
    usernamePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    cancel: string;
    save: string;
    create: string;
    errors: {
      nameRequired: string;
      urlRequired: string;
      invalidUrl: string;
    };
  };
  deleteModal: {
    title: string;
    message: string;
    cancel: string;
    confirm: string;
  };
  toasts: {
    added: string;
    updated: string;
    deleted: string;
    reset: string;
    cloudSynced: string;
  };
  empty: {
    title: string;
    noMatches: string;
    clearSearch: string;
    addNew: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: {
    appName: 'Web Launcher',
    searchPlaceholder: 'Search apps...',
    addApp: 'Add App',
    resetDefaults: 'Reset default apps',
    switchTheme: 'Toggle theme',
    cloudSynced: 'Telegram Cloud',
    categories: {
      All: 'All',
      Social: 'Social',
      Productivity: 'Productivity',
      Utilities: 'Utilities',
      Media: 'Media',
      News: 'News',
      Games: 'Games',
      Custom: 'Custom'
    },
    card: {
      launch: 'Launch In-App',
      edit: 'Edit',
      delete: 'Delete',
      inAppEmbed: 'In-App',
      copyLink: 'Copy URL',
      copied: 'Copied!',
      hasCredentials: 'Saved login'
    },
    viewer: {
      backToLauncher: 'Launcher',
      refresh: 'Refresh',
      loading: 'Loading application...',
      connectingTo: 'Connecting to',
      copyUser: 'User',
      copyPass: 'Pass',
      userCopied: 'Username copied!',
      passCopied: 'Password copied!'
    },
    modal: {
      addTitle: 'Add Web App',
      editTitle: 'Edit Web App',
      subtitle: 'Synced with Telegram Cloud Storage',
      quickSuggestions: 'Quick Suggestions',
      urlLabel: 'Web URL *',
      urlPlaceholder: 'https://example.com',
      nameLabel: 'App Name *',
      namePlaceholder: 'e.g. YouTube, Notion',
      iconLabel: 'Icon URL (Optional)',
      iconPlaceholder: 'https://... or auto-fetched',
      categoryLabel: 'Category',
      colorLabel: 'Accent Color',
      descLabel: 'Description (Optional)',
      descPlaceholder: 'Short description...',
      credentialsSection: 'Telegram Cloud Login Credentials',
      credentialsDesc: 'Saved securely in Telegram Cloud Storage for quick autofill/copying',
      usernameLabel: 'Login Username / Email (Optional)',
      usernamePlaceholder: 'user@example.com or username',
      passwordLabel: 'Login Password / Key (Optional)',
      passwordPlaceholder: '••••••••••••',
      cancel: 'Cancel',
      save: 'Save Changes',
      create: 'Add to Launcher',
      errors: {
        nameRequired: 'App name is required',
        urlRequired: 'Web URL is required',
        invalidUrl: 'Please enter a valid website URL'
      }
    },
    deleteModal: {
      title: 'Delete this web app?',
      message: 'This app and any saved cloud credentials will be removed.',
      cancel: 'Cancel',
      confirm: 'Delete'
    },
    toasts: {
      added: 'Saved to Telegram Cloud',
      updated: 'Updated in Telegram Cloud',
      deleted: 'Removed from Telegram Cloud',
      reset: 'Reset to default apps',
      cloudSynced: 'Synced with Telegram Cloud Storage'
    },
    empty: {
      title: 'No apps found',
      noMatches: 'No apps match your criteria.',
      clearSearch: 'Clear search',
      addNew: 'Add app'
    }
  },
  es: {
    appName: 'Lanzador Web',
    searchPlaceholder: 'Buscar aplicaciones...',
    addApp: 'Añadir App',
    resetDefaults: 'Restablecer apps',
    switchTheme: 'Cambiar tema',
    cloudSynced: 'Nube de Telegram',
    categories: {
      All: 'Todas',
      Social: 'Social',
      Productivity: 'Productividad',
      Utilities: 'Utilidades',
      Media: 'Multimedia',
      News: 'Noticias',
      Games: 'Juegos',
      Custom: 'Personalizado'
    },
    card: {
      launch: 'Abrir In-App',
      edit: 'Editar',
      delete: 'Eliminar',
      inAppEmbed: 'In-App',
      copyLink: 'Copiar URL',
      copied: '¡Copiado!',
      hasCredentials: 'Login guardado'
    },
    viewer: {
      backToLauncher: 'Lanzador',
      refresh: 'Actualizar',
      loading: 'Cargando aplicación...',
      connectingTo: 'Conectando con',
      copyUser: 'Usuario',
      copyPass: 'Clave',
      userCopied: '¡Usuario copiado!',
      passCopied: '¡Contraseña copiada!'
    },
    modal: {
      addTitle: 'Añadir Web App',
      editTitle: 'Editar Web App',
      subtitle: 'Sincronizado con Telegram Cloud Storage',
      quickSuggestions: 'Sugerencias Rápidas',
      urlLabel: 'URL Web *',
      urlPlaceholder: 'https://ejemplo.com',
      nameLabel: 'Nombre de la App *',
      namePlaceholder: 'ej. YouTube, Notion',
      iconLabel: 'URL del Icono (Opcional)',
      iconPlaceholder: 'https://... o auto-detección',
      categoryLabel: 'Categoría',
      colorLabel: 'Color de Acento',
      descLabel: 'Descripción (Opcional)',
      descPlaceholder: 'Breve descripción...',
      credentialsSection: 'Credenciales de Login en Telegram Cloud',
      credentialsDesc: 'Guardado de forma segura en Telegram Cloud Storage',
      usernameLabel: 'Usuario o Correo de Acceso (Opcional)',
      usernamePlaceholder: 'usuario@ejemplo.com o nombre',
      passwordLabel: 'Contraseña o Clave de Acceso (Opcional)',
      passwordPlaceholder: '••••••••••••',
      cancel: 'Cancelar',
      save: 'Guardar Cambios',
      create: 'Añadir al Lanzador',
      errors: {
        nameRequired: 'El nombre es obligatorio',
        urlRequired: 'La URL es obligatoria',
        invalidUrl: 'Por favor ingresa una URL válida'
      }
    },
    deleteModal: {
      title: '¿Eliminar esta aplicación?',
      message: 'Se eliminará la aplicación y sus credenciales de la nube.',
      cancel: 'Cancelar',
      confirm: 'Eliminar'
    },
    toasts: {
      added: 'Guardado en Telegram Cloud',
      updated: 'Actualizado en Telegram Cloud',
      deleted: 'Eliminado de Telegram Cloud',
      reset: 'Restablecido a las apps por defecto',
      cloudSynced: 'Sincronizado con Telegram Cloud Storage'
    },
    empty: {
      title: 'No se encontraron apps',
      noMatches: 'Ninguna aplicación coincide con tu búsqueda.',
      clearSearch: 'Limpiar búsqueda',
      addNew: 'Añadir app'
    }
  }
};
