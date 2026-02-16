import fs from 'fs';
import path from 'path';

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require web manifest file and proper HTML link tag',
      category: 'Best Practices',
    },
    fixable: null,
    schema: [],
    messages: {
      missingManifestFile: 'Web manifest file not found. Expected {{expectedPath}}',
      missingManifestLink: 'Missing web manifest link tag in HTML head',
      invalidManifestLink: 'Web manifest link tag has incorrect rel or href attribute',
    },
  },

  create(context) {
    const filename = context.getFilename();
    
    // Only run this rule on HTML files
    if (!filename.endsWith('.html')) {
      return {};
    }

    return {
      Program(node) {
        const sourceCode = context.getSourceCode();
        const htmlContent = sourceCode.getText();
        
        // Check for manifest link tag in HTML
        const manifestLinkRegex = /<link[^>]*rel=["']manifest["'][^>]*>/i;
        const manifestMatch = htmlContent.match(manifestLinkRegex);
        
        if (!manifestMatch) {
          context.report({
            node,
            messageId: 'missingManifestLink',
          });
          return;
        }

        // Extract href from the manifest link
        const hrefMatch = manifestMatch[0].match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) {
          context.report({
            node,
            messageId: 'invalidManifestLink',
          });
          return;
        }

        const manifestPath = hrefMatch[1];
        
        // Resolve the manifest file path relative to the project root
        const htmlDir = path.dirname(filename);
        let resolvedManifestPath;
        
        if (manifestPath.startsWith('/')) {
          // Absolute path - check in public directory first, then project root
          const publicPath = path.resolve(htmlDir, 'public' + manifestPath);
          const rootPath = path.resolve(htmlDir, '.' + manifestPath);
          resolvedManifestPath = fs.existsSync(publicPath) ? publicPath : rootPath;
        } else {
          // Relative path
          resolvedManifestPath = path.resolve(htmlDir, manifestPath);
        }
        
        // Check if the manifest file exists
        if (!fs.existsSync(resolvedManifestPath)) {
          context.report({
            node,
            messageId: 'missingManifestFile',
            data: {
              expectedPath: manifestPath,
            },
          });
        }
      },
    };
  },
};