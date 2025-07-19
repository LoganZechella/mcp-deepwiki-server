
export class ResponseFormatter {
  formatSuccess(data: any): any {
    return {
      content: [
        {
          type: 'text',
          text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  formatError(message: string): any {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }

  formatProgress(message: string): any {
    return {
      content: [
        {
          type: 'text',
          text: `Progress: ${message}`,
        },
      ],
    };
  }
}

