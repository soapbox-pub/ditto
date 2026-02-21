declare module 'uri-templates' {
  interface UriTemplate {
    fill(vars: Record<string, string>): string;
  }
  function UriTemplate(template: string): UriTemplate;
  export default UriTemplate;
}
