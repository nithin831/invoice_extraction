$(document).ready(function() {
    // CSV Download for specific table functionality
    function tableToCSV(tableId) {
        let csvContent = '';
        const table = $('#table' + tableId).find('table');
        const headers = [];
        const rows = [];

        // Get headers
        table.find('thead th').each(function() {
            headers.push('"' + $(this).text().replace(/"/g, '""') + '"'); // Wrap header in quotes
        });
        csvContent += headers.join(',') + '\n';

        // Get rows
        table.find('tbody tr').each(function() {
            const cells = [];
            $(this).find('td').each(function() {
                cells.push('"' + $(this).text().replace(/"/g, '""') + '"'); // Wrap cell in quotes
            });
            rows.push(cells.join(','));
        });
        csvContent += rows.join('\n') + '\n';
        console.log(csvContent)
        return csvContent;
    }


    // Handle CSV download button click
    $(document).on('click', '.download-csv', function() {
        const tableId = $(this).data('table-id');
        const csv = tableToCSV(tableId);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'table_' + tableId + '.csv';
        link.click();
        URL.revokeObjectURL(url);
    });

    // When the form is submitted, show the file metadata
    $('#upload-form').submit(function(e) {
        e.preventDefault();
        
        const fileInput = $('#file')[0].files[0];
        if (fileInput) {
            // Hide the form inputs and upload button (Optional if you want to hide the form after file upload)
            $('#file-upload-section').hide();
            $('#document-type-section').hide();
            $('#upload-button').hide();

            // Show the file metadata
            $('#file-meta-section').show();
            $('#file-name').text(fileInput.name);
            $('#file-size').text((fileInput.size / 1024).toFixed(2) + ' KB');
            $('#file-type').text(fileInput.type);
            
            // Show the loading animation
            $('#loading-animation').show();

            // Simulate document processing (Replace this with real backend processing call)
            setTimeout(function() {
                // Hide the loading animation after tables are extracted
                $('#loading-animation').hide();
                
                // Show the tables (this should be done dynamically after processing)
                $('#tables-container').html('<p>Tables extracted successfully!</p>');
            }, 500000); // Simulate delay for extraction
            // Proceed with form submission
            this.submit();
        }
    });

    // Remove file and reset the form when "Remove File" is clicked
    $('#remove-file-button').click(function() {
        $.ajax({
            url: remove_file,  // Add the appropriate URL for the backend endpoint
            method: 'POST',
            headers: {
                'X-CSRFToken': '{{ csrf_token }}'
            },
            success: function() {
                // Reset frontend after successful file removal
                $('#file-upload-section').show();
                $('#save-to-mongodb').hide();
                $('#document-type-section').show();
                $('#upload-button').show();
                $('#file-meta-section').hide();
                $('#file').val('');  // Reset file input
                $('#tables-container').html('');  // Clear the displayed tables
                $('#table_dropdown').hide();
                $('#kv_dropdown').hide();  // Hide the KV dropdown
                $('#mapping-rule-table').hide();
                $('#save-mapping').hide();
                // Clear the undo stack
                undoStack = [];
                
            },
            error: function() {
                alert('Failed to remove the file from the backend.');
            }
        });
    });

    // Table checkbox handler
    $('.table-checkbox').change(function() {
        const tableId = $(this).val();
        $('#save-to-mongodb').show();
        if ($(this).is(':checked')) {
            $('#table' + tableId).show();
            
        } else {
            $('#table' + tableId).hide();
        }
    });

    // KV Pair checkbox handler
    $('.kv-checkbox').change(function() {
        const kvId = $(this).val();
        const selectedKey = $(this).next().text().split(":")[0].trim();
        
        // If the checkbox is checked, add the key-value pair as a column
        if ($(this).is(':checked')) {
            const selectedValue = $(this).next().text().split(":")[1].trim();

            // Apply selected key-value to all selected tables
            $('.table-checkbox:checked').each(function() {
                const tableId = $(this).val();
                const table = $('#table' + tableId + ' table');

                // If the table doesn't already have the new column, add it
                if (table.find('thead th:contains("' + selectedKey + '")').length === 0) {
                    // Add new column to table header at the beginning
                    table.find('thead tr').prepend('<th>' + selectedKey + '</th>');

                    // Prepend value to all rows in the table
                    table.find('tbody tr').each(function() {
                        $(this).prepend('<td>' + selectedValue + '</td>');
                    });
                }
            });
        } else {
            // If unchecked, remove the key-value pair from all selected tables
            $('.table-checkbox:checked').each(function() {
                const tableId = $(this).val();
                const table = $('#table' + tableId + ' table');

                // Find the index of the column to remove
                const columnIndex = table.find('thead th').filter(function() {
                    return $(this).text() === selectedKey;
                }).index();

                // If the column exists, remove it
                if (columnIndex !== -1) {
                    // Remove header column
                    table.find('thead th').eq(columnIndex).remove();

                    // Remove each row's corresponding cell
                    table.find('tbody tr').each(function() {
                        $(this).find('td').eq(columnIndex).remove();
                    });
                }
            });
        }
    });

    // Stack for undo functionality
    let undoStack = [];

    function pushToUndoStack(action, details) {
        undoStack.push({ action, details });
        $('#undo-button').show(); // Show undo button when there's something to undo
    }

    function undoLastAction() {
        if (undoStack.length === 0) return;

        const lastAction = undoStack.pop();

        if (lastAction.action === 'delete-row') {
            const rowIndex = lastAction.details.rowIndex;
            const tableBody = lastAction.details.table.find('tbody');
            console.log("nk", rowIndex)
            // Insert the row back at its original position
            if (rowIndex === 0) {
                tableBody.prepend(lastAction.details.row);
            } else {
                tableBody.find('tr').eq(rowIndex - 1).before(lastAction.details.row);
            }
        } else if (lastAction.action === 'delete-column') {
            const columnIndex = lastAction.details.columnIndex;
            const columnData = lastAction.details.columnData;

            // Reinsert the column data at the correct position
            lastAction.details.table.find('tr').each(function(index) {
                const cell = columnData[index];
                if (index === 0) {
                    $(this).find('th').eq(columnIndex - 1).after(cell); // Insert the header at the correct position
                } else {
                    $(this).find('td').eq(columnIndex - 1).after(cell); // Insert the data cell at the correct position
                }
            });

        } else if (lastAction.action === 'add-kv-pair') {
            const columnIndex = lastAction.details.columnIndex;
            lastAction.details.table.find('tr').each(function() {
                $(this).find('td, th').eq(columnIndex).remove();
            });
        }

        if (undoStack.length === 0) {
            $('#undo-button').hide();
        }
    }

    // Handle undo button click
    $('#undo-button').click(function() {
        undoLastAction();
    });

    // Handle row and column deletion
    $(document).on('click', '.delete-selected', function() {
        const tableSection = $(this).closest('.table-section');
        // Get the number of checked key-value pairs
        const kvCheckedCount = $('.kv-checkbox:checked').length;
        // Delete selected rows
        tableSection.find('tbody tr').each(function(index) {
            
            if ($(this).find('.select-row').is(':checked')) {
                console.log("pk",index)
                const row = $(this).clone();
                pushToUndoStack('delete-row', { row: row, rowIndex: index, table: $(this).closest('table') });
                $(this).remove(); // Remove the entire row
            }
        });

         // Delete selected columns
         tableSection.find('.select-column:checked').each(function() {
            let columnIndex = $(this).data('column-id');
            // Adjust the column index by the number of key-value pairs checked
            columnIndex += kvCheckedCount;
            // Collect column data before removal
            const columnData = [];
            tableSection.find('tr').each(function() {
                columnData.push($(this).find('td, th').eq(columnIndex).clone());
            });

            // Push the deleted column to undo stack
            pushToUndoStack('delete-column', { columnIndex: columnIndex, columnData: columnData, table: $(this).closest('table') });

            // Remove the column
            tableSection.find('tr').each(function() {
                $(this).find('td, th').eq(columnIndex).remove(); // Remove the column instead of hiding it
            });
        });
    });

     // Function to populate mapping rule fields
     function fetchMappingFields() {
        $.ajax({
            url: fetch_db,  // Backend URL to fetch MongoDB fields
            method: "GET",
            success: function (response) {
                const fields = response.fields;
                console.log(fields)
                const kvPairs = response.kvPairs; 
                console.log(kvPairs)
                const mappingBody = $('#mapping-body');
                mappingBody.empty(); // Clear existing rows
                                
                // Get column names from the tables on the page
                let tableColumns = [];
                $('.table-section').find('table thead th').each(function() {
                    const columnName = $(this).text().trim();
                    if (columnName) {  // Check if the column name is not empty
                        tableColumns.push({ key: columnName, value: columnName });
                    }
                });
                console.log(tableColumns)
                fields.forEach(field => {

                    const row = `
                        <tr>
                            <td>
                                <select class="form-control kv-dropdown">
                                    <option value="">Select Source</option>
                                    !-- Render Key-Value pairs -->
                                    ${kvPairs.map(kv => `<option value="${kv.value}">${kv.key}: ${kv.value}</option>`).join('')}
                                    
                                    <!-- Render Table Columns (only column name is displayed) -->
                                    ${tableColumns.map(col => `<option value="${col.value}">${col.key}</option>`).join('')}
                            
                                </select>
                            </td>   
                            <td>
                                ${field}
                            </td>
                        </tr>`;
                    mappingBody.append(row);
                });
            },
            error: function () {
                alert("Error fetching fields from MongoDB.");
            }
        });
    }

    function saveMappingToMongoDB() {
        const mappings = [];
    
        // Loop through each row in the mapping table
        $('#mapping-body tr').each(function() {
            const selectedSource = $(this).find('.kv-dropdown').val(); // Get selected key-value or table column
            const targetField = $(this).find('td').eq(1).text();   // Get the target MongoDB field
            
            if (selectedSource) {
                // Check if it's a key-value pair or a table column
                const isTableColumn = $('.table-section').find('thead th:contains("' + selectedSource + '")').length > 0;
    
                if (isTableColumn) {
                    // It's a table column, so gather the column's values from the table
                    const columnValues = [];
                    $('.table-section').find('thead th:contains("' + selectedSource + '")').each(function() {
                        const columnIndex = $(this).index();  // Get the index of the selected column
    
                        // Fetch all cell values from this column
                        $(this).closest('table').find('tbody tr').each(function() {
                            const cellValue = $(this).find('td').eq(columnIndex).text().trim();
                            columnValues.push(cellValue);
                        });
                    });
    
                    // Add the column values along with the target field
                    mappings.push({ targetField: targetField, values: columnValues });
                } else {
                    // It's a key-value pair, just map the value
                    mappings.push({ targetField: targetField, value: selectedSource });
                }
            }
        });
    
        // Check if there are any mappings to save
        if (mappings.length > 0) {
            // Send the mappings to the backend via AJAX
            $.ajax({
                url: insert_to_db,  // Replace with your backend URL for MongoDB insertion
                method: "POST",
                headers: {
                    'X-CSRFToken': '{{ csrf_token }}'  // Include CSRF token for security
                },
                contentType: "application/json",
                data: JSON.stringify({ mappings: mappings }),  // Send the mappings as JSON
                success: function(response) {
                    alert("Mapping saved successfully to MongoDB!");
                },
                error: function(error) {
                    alert("Failed to save mapping to MongoDB.");
                }
            });
        } else {
            alert("Please select at least one key-value pair or table column to save.");
        }
    }
    
    // Add a button to trigger the saving process
    $('#save-mapping').click(function() {
        saveMappingToMongoDB();
    });


    // Fetch the fields when Mapping Rule tab is clicked
    $('#mapping-rule-tab').on('click', function () {
        fetchMappingFields();
    });

    
    // Enable CSV download if there are visible tables on page load
    

});
