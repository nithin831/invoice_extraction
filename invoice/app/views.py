from django.shortcuts import render
from django.conf import settings
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
import pandas as pd
import os
from dotenv import load_dotenv
from django.http import JsonResponse
from pymongo import MongoClient
import json
load_dotenv()

endpoint = os.environ["endpoint"]
key = os.environ["key"]

client = MongoClient("mongodb://localhost:27017/")
# client = MongoClient('mongodb://db:27017/')
db = client["invoices"]
collection = db["invoice"]
keyvalue_pair = {}

def upload_document(request):
    context = {'kv_df': [], 'tables': []}

    if request.method == 'POST' and request.FILES['file']:
        document_type = request.POST.get('document_type')
        file = request.FILES['file']

        # Initialize Azure Form Recognizer client
        document_analysis_client = DocumentAnalysisClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key)
        )

        # Analyze the document
        poller = document_analysis_client.begin_analyze_document(
            "prebuilt-document", document=file
        )
        result = poller.result()

        # Process the result
        global kv_pairs, tables, keyvalue_pair
        kv_pairs = []
        for kv_pair in result.key_value_pairs:
            if kv_pair.key and kv_pair.value:
                clean_key = kv_pair.key.content.rstrip(':')
                kv_pairs.append((clean_key, kv_pair.value.content))

        # Convert list of key-value pairs into a format for Django template
        kv_df = [{'key': kv[0], 'value': kv[1]} for kv in kv_pairs]
        keyvalue_pair = {kv[0]:kv[1] for kv in kv_pairs}
       
        tables = []
        if result.tables:
            for table in result.tables:
                data = []
                for cell in table.cells:
                    data.append([cell.row_index, cell.column_index, cell.content])
                table_df = pd.DataFrame(data, columns=["row_index", "column_index", "content"])
                table_df = table_df.pivot(index="row_index", columns="column_index", values="content")
                table_df.reset_index(drop=True, inplace=True)
                table_df.columns = table_df.iloc[0]
                table_df = table_df.drop(table_df.index[0])
                table_df.reset_index(drop=True, inplace=True)
                tables.append(table_df)

        context = {
            'kv_df': kv_df,  # Pass list of key-value pairs instead of DataFrame
            'tables': tables,
            'document_type': document_type,
            'file_name': file.name,
            'file_size': file.size,
            'file_type': file.content_type,
        
        }

    return render(request, 'upload.html', context)

def remove_file(request):
    if request.method == 'POST':
        return JsonResponse({'message': 'File removed successfully.'})
    return JsonResponse({'message': 'Invalid request'}, status=400)


# Function to get the field names from MongoDB
def get_invoice_fields(request):
    
    response_data = {
            'fields': ["Invoice No", "Customer Name", "Invoice Date","Invoice Item", "Quantity", "Base Unit", "Rate", "GST"],  # MongoDB document fields for "Target"
            'kvPairs': [{'key': key, 'value': value} for key, value in keyvalue_pair.items()]  # Key-value pairs
        }
    return JsonResponse(response_data, status=200)
    

def insert_to_db(request):
    """
    This view handles the insertion of mapping data to MongoDB.
    It expects the data in JSON format where source columns are mapped to target columns.
    """
    if request.method == 'POST':
        try:
            # Parse the JSON data received from the AJAX request
            data = json.loads(request.body)
            mappings = data.get('mappings', [])

            # Dictionary to store all data that will be inserted as new rows (documents) in MongoDB
            mongo_documents = []

            max_rows = 0

            # First, determine the maximum number of rows based on the selected table columns
            for mapping in mappings:
                if 'values' in mapping:
                    max_rows = max(max_rows, len(mapping['values']))

            # Prepare the documents for MongoDB
            for i in range(max_rows):
                # Create a new document for each row
                document = {}

                # For each mapping, add the column values or key-value pairs to the document
                for mapping in mappings:
                    target_field = mapping.get('targetField')

                    if 'values' in mapping:
                        values = mapping['values']
                        # Get the value for the current row, or use an empty string if no value exists for this row
                        value = values[i] if i < len(values) else ''
                        document[target_field] = value
                    elif 'value' in mapping:
                        # Replicate the same key-value pair across all rows
                        document[target_field] = mapping['value']

                # Add the constructed document to the list
                mongo_documents.append(document)

            # Insert the documents into MongoDB
            if mongo_documents:
                collection.insert_many(mongo_documents)

            return JsonResponse({'status': 'success', 'message': 'Data mapped and saved successfully to MongoDB!'})

        except Exception as e:
            # Return an error response if something goes wrong
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    else:
        # Return an error if the request method is not POST
        return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=400)
    
