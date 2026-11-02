export type Language = 'en' | 'es';

export interface Translations {
  appName: string;
  searchPlaceholder: string;
  addApp: string;
  resetDefaults: string;
  switchTheme: string;
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
  };
  viewer: {
    backToLauncher: string;
    refresh: string;
    loading: string;
    connectingTo: string;
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
      copied: 'Copied!'
    },
    viewer: {
      backToLauncher: 'Launcher',
      refresh: 'Refresh',
      loading: 'Loading application...',
      connectingTo: 'Connecting to'
    },
    modal: {
      addTitle: 'Add Web App',
      editTitle: 'Edit Web App',
      subtitle: 'Add any website to your in-app launcher',
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
      cancel: 'Cancel',
      save: 'Save',
      create: 'Add to Launcher',
      errors: {
        nameRequired: 'App name is required',
        urlRequired: 'Web URL is required',
        invalidUrl: 'Please enter a valid website URL'
      }
    },
    deleteModal: {
      title: 'Delete this web app?',
      message: 'This app will be removed from your personal launcher.',
      cancel: 'Cancel',
      confirm: 'Delete'
    },
    toasts: {
      added: 'Added to launcher',
      updated: 'App updated',
      deleted: 'App deleted',
      reset: 'Reset to default apps'
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
      copied: '¡Copiado!'
    },
    viewer: {
      backToLauncher: 'Lanzador',
      refresh: 'Actualizar',
      loading: 'Cargando aplicación...',
      connectingTo: 'Conectando con'
    },
    modal: {
      addTitle: 'Añadir Web App',
      editTitle: 'Editar Web App',
      subtitle: 'Añade cualquier sitio a tu lanzador in-app',
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
      cancel: 'Cancelar',
      save: 'Guardar',
      create: 'Añadir al Lanzador',
      errors: {
        nameRequired: 'El nombre es obligatorio',
        urlRequired: 'La URL es obligatoria',
        invalidUrl: 'Por favor ingresa una URL válida'
      }
    },
    deleteModal: {
      title: '¿Eliminar esta aplicación?',
      message: 'Esta aplicación se eliminará de tu lanzador personal.',
      cancel: 'Cancelar',
      confirm: 'Eliminar'
    },
    toasts: {
      added: 'Añadida al lanzador',
      updated: 'App actualizada',
      deleted: 'App eliminada',
      reset: 'Restablecido a las apps por defecto'
    },
    empty: {
      title: 'No se encontraron apps',
      noMatches: 'Ninguna aplicación coincide con tu búsqueda.',
      clearSearch: 'Limpiar búsqueda',
      addNew: 'Añadir app'
    }
  }
};
