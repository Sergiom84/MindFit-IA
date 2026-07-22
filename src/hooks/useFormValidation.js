import { useState, useMemo } from 'react';

const VALIDATION_RULES = {
  email: {
    required: 'El email es requerido',
    pattern: {
      value: /\S+@\S+\.\S+/,
      message: 'El email no es válido'
    }
  },
  password: {
    required: 'La contraseña es requerida',
    minLength: {
      value: 6,
      message: 'La contraseña debe tener al menos 6 caracteres'
    }
  }
};

export const useFormValidation = (initialData = {}) => {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateField = (name, value) => {
    const rules = VALIDATION_RULES[name];
    if (!rules) return '';

    // Required validation
    if (rules.required && !value.trim()) {
      return rules.required;
    }

    // Pattern validation (email)
    if (rules.pattern && !rules.pattern.value.test(value)) {
      return rules.pattern.message;
    }

    // Min length validation
    if (rules.minLength && value.length < rules.minLength.value) {
      return rules.minLength.message;
    }

    return '';
  };

  const validateForm = (fieldsToValidate = Object.keys(VALIDATION_RULES)) => {
    const newErrors = {};

    fieldsToValidate.forEach(field => {
      const error = validateField(field, formData[field] || '');
      if (error) {
        newErrors[field] = error;
      }
    });

    return newErrors;
  };

  const isValid = useMemo(() => {
    const validationErrors = validateForm();
    return Object.keys(validationErrors).length === 0;
  }, [formData]);

  const clearErrors = () => {
    setErrors({});
  };

  const setFieldError = (field, error) => {
    setErrors(prev => ({
      ...prev,
      [field]: error
    }));
  };

  return {
    formData,
    setFormData,
    errors,
    setErrors,
    isValid,
    handleInputChange,
    validateForm,
    validateField,
    clearErrors,
    setFieldError
  };
};