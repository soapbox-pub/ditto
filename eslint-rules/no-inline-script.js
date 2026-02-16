/**
 * Rule to prevent inline script tags in HTML files
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent inline script tags in HTML files',
      category: 'Security',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noInlineScript: 'Inline script tags are not allowed. Move script content to external files.',
    },
  },

  create(context) {
    return {
      // For HTML files, we need to check script tags
      'ScriptTag'(node) {
        // Check if this is an inline script (has content but no src attribute)
        const hasContent = node.value && node.value.value && node.value.value.trim().length > 0;
        const hasSrc = node.attributes && node.attributes.some(attr => 
          attr.key && attr.key.value === 'src'
        );

        // If the script has content but no src attribute, it's an inline script
        if (hasContent && !hasSrc) {
          context.report({
            node,
            messageId: 'noInlineScript',
          });
        }
      },
    };
  },
};