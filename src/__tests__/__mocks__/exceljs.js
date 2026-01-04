// Mock for exceljs module
export class Workbook {
  constructor() {
    this.creator = "";
    this.lastModifiedBy = "";
    this.created = new Date();
    this.modified = new Date();
    this.worksheets = [];
  }

  addWorksheet(name) {
    const worksheet = {
      name,
      columns: [],
      rows: [],
      addRow(data) {
        this.rows.push(data);
        return { commit: () => {} };
      },
      getColumn(index) {
        return {
          width: 0,
          set width(value) {
            this._width = value;
          },
          get width() {
            return this._width || 0;
          },
        };
      },
    };
    this.worksheets.push(worksheet);
    return worksheet;
  }

  get xlsx() {
    return {
      writeBuffer: async () => Buffer.from("mock-excel-data"),
      write: async (stream) => {
        stream.write(Buffer.from("mock-excel-data"));
        stream.end();
      },
    };
  }
}

export default { Workbook };
