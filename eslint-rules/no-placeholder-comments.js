/**
 * Custom ESLint rule to detect placeholder comments starting with "// In a real"
 * These comments indicate incomplete implementations that should be replaced with real code.
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow placeholder comments starting with '// In a real'",
      category: "Best Practices",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      placeholderComment: "Placeholder comment detected: '{{comment}}'. This should be replaced with a real implementation.",
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        
        comments.forEach((comment) => {
          const commentText = comment.value.trim();
          
          // Check if comment starts with "In a real" (case-insensitive)
          if (commentText.toLowerCase().startsWith("in a real")) {
            context.report({
              node: comment,
              messageId: "placeholderComment",
              data: {
                comment: `// ${commentText}`,
              },
            });
          }
        });
      },
    };
  },
};